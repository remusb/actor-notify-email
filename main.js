const Apify = require('apify');
const fs = require('fs');
const nodemailer = require('nodemailer')

Apify.main(async () => {
    const batchSize = parseInt(process.env.BATCH_SIZE);
    const htmlOutTemplate = fs.readFileSync('/template/email.html', 'utf8');
    let cnt = 0;

    let adType = 'terenuri';
    if ('NOTIFY_TYPE' in process.env) {
        adType = process.env.NOTIFY_TYPE;
    }
    let saleType = 'vanzare';
    if ('SALE_TYPE' in process.env) {
        saleType = process.env.SALE_TYPE;
    }
    const store = await Apify.openKeyValueStore(adType);
    let domainCount = {};

    if (store != null) {
        let htmlOut = htmlOutTemplate;
        let executariOut = '';
        let vanzareOut = '';

        let entryKeys = [];
        await store.forEachKey(async (key, index, info) => {
            entryKeys.push(key);
        });

        console.log(`Processing ${entryKeys.length} entries`);
        for (let i = 0; i < entryKeys.length; i++) {
            const key = entryKeys[i];
            const entry = await store.getValue(key);

            if (('notified' in entry) && entry.notified && process.env.INCLUDE_NOTIFIED != "1") {
                continue;
            }
            if ((saleType == 'executare' && !entry.executare) ||
                    (saleType == 'vanzare' && entry.executare)) {
                continue;
            }

            if (!('title' in entry)) {
                console.log(`Ignoring entry: ${JSON.stringify(entry)}`);
                if (process.env.DELETE_INVALID == "1") {
                    await store.setValue(key, null);
                }
                continue;
            }
            if ('CONTAINS' in process.env) {
                const re = new RegExp(process.env.CONTAINS, "ig");
                if (entry.title.match(re) !== null ||
                        ('location' in entry && entry.location.match(re) !== null) ||
                        ('detail' in entry && entry.detail.match(re) !== null)) {
                    console.log(`Found match entry with CONTAINS: ${entry.id}`);
                } else {
                    continue;
                }
            }
            if ('SECTOR' in process.env) {
                if ('sector' in entry && entry.sector == parseInt(process.env.SECTOR)) {
                    console.log(`Found match entry with SECTOR: ${entry.id}`);
                } else {
                    continue;
                }
            }

            if (process.env.INCLUDE_NOTIFIED != "1") {
                entry.notified = true;
                await store.setValue(key, entry);
            }

            if ('domain' in entry) {
                if (entry.domain in domainCount) {
                    domainCount[entry.domain]++;
                } else {
                    domainCount[entry.domain] = 1;
                }
            }

            if (entry.executare) {
                executariOut += `<tr><td>${entry.title}, ${entry.size} mp</td><td>${entry.price} EUR</td><td>${entry.detail}</td>`;
                executariOut += `<td><a href="${entry.url}" target="_blank">Link</a></td></tr>`;
            } else {
                if (adType == 'terenuri') {
                    vanzareOut += `<tr><td>${entry.title}, ${entry.size} mp</td><td>${entry.price} EUR</td><td>${entry.detail}</td>`;
                } else {
                    vanzareOut += `<tr><td>${entry.title}</td><td>${entry.house}, ${entry.size}, ${entry.rooms} cam., ${entry.year}</td><td>${entry.price} EUR</td><td>${entry.detail}</td>`;
                }
                vanzareOut += `<td><a href="${entry.url}" target="_blank">Link</a></td></tr>`;
            }
            cnt++;
        }

        if (executariOut != '' || vanzareOut != '') {
            htmlOut += '<ul>'
            for (const [key, value] of Object.entries(domainCount)) {
                htmlOut += `<li>${key}: ${value}</li>`;
            }
            htmlOut += '</ul>'

            if (adType == 'terenuri') {
                if (executariOut != '') {
                    htmlOut += '<table><thead><tr><th>Titlu/Supr.</th><th>Pret</th><th>Detalii</th><th>URL</th></thead>' + executariOut + '</table>';
                }
                if (vanzareOut != '') {
                    htmlOut += '<table><thead><tr><th>Titlu/Supr.</th><th>Pret</th><th>Detalii</th><th>URL</th></thead>' + vanzareOut + '</table>';
                }
            } else {
                htmlOut += '<table><thead><tr><th>Titlu</th><th>Supr/Cam/An</th><th>Pret</th><th>Detalii</th><th>URL</th></thead>' + vanzareOut + '</table>';
            }
            htmlOut += '</body></html>';

            console.log(`Sending e-mail using ${process.env.GMAIL_USER}`);

            let transporter = nodemailer.createTransport({
             host: "smtp.gmail.com",
             port: 465,
             secure: true,
             auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASSWORD
                }
            });
            const niceType = adType.charAt(0).toUpperCase() + adType.slice(1);
            const niceSaleType = saleType.charAt(0).toUpperCase() + saleType.slice(1);
            let emailTitle = `Status ${niceSaleType} ${niceType}`;
            if ('CONTAINS' in process.env) {
                emailTitle = `Status ${niceSaleType} ${niceType} / ${process.env.CONTAINS}`;
            }
            if ('SECTOR' in process.env) {
                emailTitle = `Status ${niceSaleType} ${niceType} / Sector ${process.env.SECTOR}`;
            }
            const info = await transporter.sendMail({
                from: process.env.GMAIL_USER,
                to: process.env.DEST,
                subject: emailTitle,
                html: htmlOut
            });
            console.log(`Info mail: ${info}`);
        }
    }

    console.log(`Processed ${cnt} entries`);
});

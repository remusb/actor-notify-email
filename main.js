const Apify = require('apify');
const fs = require('fs');
const nodemailer = require('nodemailer')

Apify.main(async () => {
    const batchSize = parseInt(process.env.BATCH_SIZE);
    const htmlOutTemplate = fs.readFileSync('/template/email.html', 'utf8');
    let cnt = 0;

    const ter = await Apify.openKeyValueStore('terenuri');
    const cas = await Apify.openKeyValueStore('case');

    if (ter != null) {
        let htmlOut = htmlOutTemplate;
        let executariOut = '';
        let vanzareOut = '';

        let entryKeys = [];
        await ter.forEachKey(async (key, index, info) => {
            entryKeys.push(key);
        });

        console.log(`Processing ${entryKeys.length} entries`);
        for (let i = 0; i < entryKeys.length; i++) {
            const key = entryKeys[i];
            const entry = await ter.getValue(key);

            if (('notified' in entry) && entry.notified && process.env.INCLUDE_NOTIFIED != "1") {
                continue;
            }
            if (!('title' in entry)) {
                console.log(`Ignoring entry: ${JSON.stringify(entry)}`);
                if (process.env.DELETE_INVALID == "1") {
                    await ter.setValue(key, null);
                }
                continue;
            }
            if ('CONTAINS' in process.env) {
                if (entry.title.includes(process.env.CONTAINS) ||
                        ('location' in entry && entry.location.includes(process.env.CONTAINS)) ||
                        ('detail' in entry && entry.detail.includes(process.env.CONTAINS))) {
                    console.log(`Found match entry: ${entry.id}`);
                } else {
                    continue;
                }
            }
            if ('SECTOR' in process.env) {
                if ('sector' in entry && entry.sector == parseInt(process.env.SECTOR)) {
                    console.log(`Found match entry: ${entry.id}`);
                } else {
                    continue;
                }
            }
            if ('AD_TYPE' in process.env) {
                if ((process.env.AD_TYPE == 'executare' && entry.executare) ||
                        (process.env.AD_TYPE == 'vanzare' && !entry.executare)) {
                    console.log(`Found match entry: ${entry.id}`);
                } else {
                    continue;
                }
            }

            if (process.env.INCLUDE_NOTIFIED != "1") {
                entry.notified = true;
                await ter.setValue(key, entry);
            }

            if (entry.executare) {
                executariOut += `<tr><td>${entry.title}, ${entry.size} mp</td><td>${entry.price} EUR</td><td>${entry.detail}</td>`;
                executariOut += `<td><a href="${entry.url}" target="_blank">Link</a></td></tr>`;
            } else {
                vanzareOut += `<tr><td>${entry.title}, ${entry.size} mp</td><td>${entry.price} EUR</td><td>${entry.detail}</td>`;
                vanzareOut += `<td><a href="${entry.url}" target="_blank">Link</a></td></tr>`;
            }
            cnt++;
        }

        if (executariOut != '' || vanzareOut != '') {
            htmlOut += '<h1>Vanzari</h1>' + '<table><thead><tr><th>Titlu/Supr.</th><th>Pret</th><th>Detalii</th><th>URL</th></thead>' + vanzareOut + '</table>';
            htmlOut += '<h1>Executari</h1>' + '<table><thead><tr><th>Titlu/Supr.</th><th>Pret</th><th>Detalii</th><th>URL</th></thead>' + executariOut + '</table>';
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
            let emailTitle = `Status Terenuri: ${cnt}`;
            if ('CONTAINS' in process.env) {
                emailTitle = `Status Terenuri / ${process.env.CONTAINS}: ${cnt}`;
            }
            if ('SECTOR' in process.env) {
                emailTitle = `Status Terenuri / Sector ${process.env.SECTOR}: ${cnt}`;
            }
            if ('AD_TYPE' in process.env) {
                emailTitle = `Status Terenuri / ${process.env.AD_TYPE.charAt(0).toUpperCase() + process.env.AD_TYPE.slice(1)}: ${cnt}`;
            }
            const info = await transporter.sendMail({
                from: process.env.GMAIL_USER,
                to: process.env.DEST,
                subject: emailTitle,
                html: htmlOut
            });
            console.log(`Info mail: ${info}`);

            await Apify.setValue('OUTPUT_TERENURI', htmlOut);
        }
    }

    console.log(`Processed ${cnt} entries`);
});

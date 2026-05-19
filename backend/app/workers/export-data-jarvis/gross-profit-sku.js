'use strict';

const { Transform } = require('json2csv');
const fs = require('fs');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-all-sociolla-gross-profit-sku' });
const workerHelpers = require('../../helpers/workerHelper');

const fieldName = {
	REFERENCE: 'reference',
	'Product Name': 'product_name',
	BRAND: 'brand',
	'Brand Type': 'brand_type',
	'Purchase Type': 'product_purchase_type',
	'Cont % (net rev)': 'cont_percent',
	'NMV (inc. tax) Amount': 'nmv',
	'NMV (inc. tax) %': 'nmv_percent',
	'Disc by Sociolla (inc. tax) Amount': 'disc_by_sociolla',
	'Disc by Sociolla (inc. tax) %/NMV': 'percent_disc_by_sociolla',
	'Disc by Brand (inc. tax) Amount': 'disc_by_brand',
	'Disc by Brand (inc. tax) %/NMV': 'percent_disc_by_brand',
	'Voucher (inc. tax) Amount': 'voucher',
	'Voucher (inc. tax) %/NMV': 'percent_voucher',
	'Marketplace Comission (exc. tax) Amount': 'marketplace_commission',
	'Marketplace Comission (exc. tax) %/NMV': 'percent_marketplace_commission',
	'Net Revenue (exc. tax) Amount': 'net_revenue',
	'Net Revenue (exc. tax) %/NMV': 'percent_net_revenue',
	'Cogs (exc. tax) Amount': 'total_cogs',
	'Cogs (exc. tax) %/Rev': 'percent_cogs',
	'Support Promo (exc. tax) Amount': 'support_promo',
	'Support Promo (exc. tax) %/Rev': 'percent_support_promo',
	'Gross Profit (exc. tax) Amount': 'gross_profit',
	'Gross Profit (exc. tax) %/Rev': 'percent_gross_profit',
};

module.exports = async (message) => {
	logger.info('Start jarvis all-sociolla-gross-profit-sku');

	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const rows = criteria.queryRow || [];
	rows.push(criteria.queryCount);

	for (const row of rows) {
		const data = Object.entries(fieldName).reduce((acc, el) => {
			if (el[1] === 'nmv_percent') {
				row[el[1]] = '100%';
			}
			acc[el[0]] = row[el[1]] || null;
			return acc;
		}, {});
		input.push(data);
	}

	try {
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Gross Profit by SKU',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

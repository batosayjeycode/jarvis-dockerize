'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-gross-profit-detail' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const moment = require('moment');

class ExportGrossProfitDetails extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-gross-profit-detail');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total}`,
			);
			return this?.options?.document?.total;
		}).catch((err) => {
			logger.error(err);
			throw err;
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`Querying LIMIT ${limit} OFFSET ${offset} by ${this.options.context?.user?.email} to ${this.options.email}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				// Process each row
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, [fieldName, fieldValue]) => {
						let value = row[fieldValue];

						if (
							[
								'unit_price',
								'unit_price_after_discount',
								'net_subtotal_nmv',
								'net_subtotal_disc_by_sociolla',
								'net_subtotal_disc_by_brand',
								'net_subtotal_voucher_prorate',
								'net_subtotal_after_discount',
								'net_subtotal_revenue',
								'default_sell_price',
								'unit_cogs',
								'net_subtotal_cogs',
								'net_subtotal_support_promo',
								'tax_rate',
							].includes(fieldValue)
						) {
							value = CommonHelper.formatNumber(value, 2);
						} else if (['journal_date', 'document_date'].includes(fieldValue)) {
							value = CommonHelper.formatDate(value);
						} else if (['quantity', 'returned_qty'].includes(fieldValue)) {
							value = parseInt(value);
						} else if (fieldValue === 'margin') {
							value = value ? parseFloat(parseFloat(value).toFixed(2)) : 0;
						} else if (fieldValue === 'untaxed_rate') {
							value = value == 0 ? '' : parseFloat(value);
						}

						acc[fieldName] = value || null;
						return acc;
					}, {});

					// Add processed data to csv array
					self.options.csv.push(data);
				}
			})
			.then(() => {
				logger.info(
					`${this.options.document.tmp_table}, Done Processed ${offset} of ${this.options.document.total} by ${this.options.context?.user?.email} to ${this.options.email}`,
				);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
}

module.exports = async (message) => {
	const criteria = message.data.criteria;
	const context = message.data.context;
	const isValidEmail = workerHelpers.checkValidEmail(criteria.send_to_email);
	if (!isValidEmail) {
		logger.error(
			`[${context?.user?.name} - ${context?.user?.email}] Email to '${criteria.send_to_email}' is not valid!`,
		);
		return;
	}
	const client = message.client;
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-gross-profit-detail`);

	const outputFile = file_name;
	const fieldName = {
		'Source Data': 'source_data',
		'Document ID': 'document_id',
		'Document Reference': 'document_reference',
		'Order Line ID': 'order_line_id',
		'Journal Date': 'journal_date',
		'Document Date': 'document_date',
		'Order Source': 'order_source',
		'Cerebro Company ID': 'cerebro_company_id',
		'Cerebro Document Type': 'cerebro_document_type',
		'Business Unit': 'business_unit',
		'Sales Team': 'sales_team',
		'Product ID': 'product_id',
		'Product Combination ID': 'product_combination_id',
		'Internal Reference': 'internal_reference',
		Barcode: 'barcode',
		'Brand Mongo ID': 'brand_mongo_id',
		'Brand Name': 'brand_name',
		'Brand Type': 'brand_type',
		'Brand Purchase Type': 'brand_purchase_type',
		'Product Purchase Type': 'product_purchase_type',
		'Product Category Parent': 'product_category_parent',
		'Product Category Child': 'product_category_child',
		'Product Category Grandchild': 'product_category_grandchild',
		'Product Category Default ID': 'product_category_default_id',
		'Product Category Default Name': 'product_category_default_name',
		'Product Classification': 'product_classification',
		'Cerebro Product Category': 'cerebro_product_category',
		'Product Owner': 'product_owner',
		'Order Product Type': 'order_product_type',
		'Parent Product ID': 'parent_product_id',
		'Is Single': 'is_single',
		'Is Order Line': 'is_not_single',
		Qty: 'quantity',
		'Returned Qty': 'returned_qty',
		'Unit Price': 'unit_price',
		'Unit Price After Discount': 'unit_price_after_discount',
		'NMV Before Discount': 'net_subtotal_nmv',
		'Disc. By Sociolla': 'net_subtotal_disc_by_sociolla',
		'Disc. By Brand': 'net_subtotal_disc_by_brand',
		'NMV After Discount': 'net_subtotal_after_discount',
		Voucher: 'net_subtotal_voucher_prorate',
		'Tax Included': 'tax_included',
		'Tax Rate': 'tax_rate',
		'Untaxed Rate': 'untaxed_rate',
		'Net Revenue': 'net_subtotal_revenue',
		'Default Sell Price': 'default_sell_price',
		Margin: 'margin',
		'Unit COGS': 'unit_cogs',
		'Subtotal COGS': 'net_subtotal_cogs',
		'Support Promo': 'net_subtotal_support_promo',
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields, header: false }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);

	const arrAdditionalInfo = [
		{ 'Start Date': 'start_date' },
		{ 'End Date': 'end_date' },
		{ Filter: 'export_label_filter_option' },
	];

	input.push({ 'Source Data': 'GP Report (Detail)' });
	arrAdditionalInfo.forEach((item) => {
		// Extract the key and value from the object
		const [key, value] = Object.entries(item)[0];
		const newObj = {};
		newObj[fields[0]] = key;
		newObj[fields[1]] = ['start_date', 'end_date'].includes(value)
			? moment(new Date(document[value])).tz('Asia/Jakarta').format('DD/MMM/YYYY')
			: document[value];

		input.push(newObj);
	});
	input.push({ 'Source Data': 'Group By' });

	// Initialize the object with the first field as an empty string
	const obj = { [fields[0]]: '' };

	// Add two empty rows
	input.push(obj, obj);

	// Create the column header object
	const columnHeader = fields.reduce((acc, field) => {
		acc[field] = field;
		return acc;
	}, {});

	// Add the column header to the input array
	input.push(columnHeader);

	const task = new ExportGrossProfitDetails({
		limit: 200,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		document,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
	});

	try {
		await task.execute();
		await workerHelpers.sendmail({
			input,
			output,
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export GP Report (Detail)',
		});
		await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

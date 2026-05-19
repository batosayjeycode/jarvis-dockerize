'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-gross-profit-detail' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');

class ExportExcelGrossProfitDetails extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-gross-profit-detail');
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
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const objData = {};
					for (const val of Object.entries(this.options.fieldName)) {
						let value = row[val[1]];

						const numberFields = [
							'unit_price',
							'unit_price_after_discount',
							'net_subtotal_nmv',
							'net_subtotal_disc_by_sociolla',
							'net_subtotal_disc_by_brand',
							'net_subtotal_voucher_prorate',
							'net_subtotal_after_discount',
							'net_subtotal_revenue',
							'unit_cogs',
							'net_subtotal_cogs',
							'net_subtotal_support_promo',
							'tax_rate',
						];

						const dateFields = ['journal_date', 'document_date'];
						const quantityFields = ['quantity', 'returned_qty'];

						switch (true) {
							case numberFields.includes(val[1]):
								value = CommonHelper.formatNumber(row[val[1]], 2);
								break;
							case dateFields.includes(val[1]):
								value = CommonHelper.formatDate(row[val[1]]);
								break;
							case quantityFields.includes(val[1]):
								value = parseInt(row[val[1]]);
								break;
							case ['margin', 'default_sell_price'].includes(val[1]):
								value = value ? parseFloat(parseFloat(value).toFixed(2)) : 0;
								break;
							case val[1] === 'untaxed_rate':
								value = value == 0 ? '' : parseFloat(value);
								break;
							default:
								value = row[val[1]];
						}

						objData[val[1]] = value;
					}
					self.options.input.push(objData);
				}
			})
			.then(() => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Done ${
						limit + offset
					}`,
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis excel-gross-profit-detail`);

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

	const columns = [
		{ width: 20 },
		{ width: 30 },
		{ width: 30 },
		{ width: 30 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 15 },
		{ width: 30 },
		{ width: 20 },
		{ width: 20 },
		{ width: 30 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 30 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 10 },
		{ width: 10 },
		{ width: 10 },
		{ width: 10 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 20 },
		{ width: 10 },
		{ width: 10 },
		{ width: 10 },
		{ width: 20 },
		{ width: 15 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 20 },
	];

	const objEntFieldName = Object.entries(fieldName);

	const ExcelTransform = function (options) {
		stream.Transform.call(this, {
			writableObjectMode: true,
			readableObjectMode: false,
		});

		this.workbook = options.workbook;
		const that = this;
		this.workbook.stream.on('readable', function () {
			const chunk = workbook.stream.read();
			that.push(chunk);
		});
		this.worksheet = options.worksheet;
		this._index = 1;
	};

	util.inherits(ExcelTransform, stream.Transform);

	ExcelTransform.prototype._transform = function (doc, encoding, callback) {
		const cnt = this._index++;
		const tmp = objEntFieldName.reduce((acc, el) => {
			acc[el[1]] = doc[el[1]];
			return acc;
		}, {});
		const row = this.worksheet.addRow(tmp);
		if ([1, 2, 3, 4, 5, 8].includes(cnt)) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).font = { bold: true };
			});
		}
		if (cnt === 8) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5DEB5' } };
			});
		}
		this.worksheet.getRow(cnt).commit();
		callback();
	};

	ExcelTransform.prototype._flush = async function (callback) {
		await this.workbook.commit(); // final commit
		workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export GP Report (Detail)',
			is_export_excel: true,
		});
		client.connectNewDwh.query(`DROP TABLE ${document?.tmp_table}`);
		logger.info(`${document?.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('GP Report (Detail)');
	worksheet.columns = objEntFieldName.map((el, idx) => {
		return {
			key: el[1],
			width: columns[idx]?.width || 20,
		};
	});

	const input = new stream.Readable({ objectMode: true });
	input._read = () => {};

	input
		.pipe(
			new ExcelTransform({
				workbook: workbook,
				worksheet: worksheet,
			}),
		)
		.pipe(process.stdout);

	input
		.on('error', (err) => {
			throw err;
		})
		.on('finish', () => {
			logger.info('finish');
		})
		.on('close', () => {
			logger.info('Stream closed.');
		})
		.on('end', () => {
			logger.info('Stream ended.');
		});

	input.push({ source_data: 'GP Report (Detail)' });
	input.push({ source_data: 'Start Date', document_id: CommonHelper.formatDate(document?.start_date) });
	input.push({ source_data: 'End Date', document_id: CommonHelper.formatDate(document?.end_date) });
	input.push({ source_data: 'Filter', document_id: document?.export_label_filter_option });
	input.push({ source_data: 'Group By' });
	input.push({ source_data: '' });
	input.push({ source_data: '' });
	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	const task = new ExportExcelGrossProfitDetails({
		limit: 200,
		offset: 0,
		queryRow: criteria.queryRow,
		document,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
		input,
	});

	try {
		await task.execute();
		input.push(null);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

'use strict';

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'export-v2-excel-export-report-cart-product-log-delete',
});
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');

class ExportExcelExportReportCartProductLogDelete extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-excel-export-report-cart-product-log-delete');
	}
	getTotalCount() {
		logger.info(
			`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total_data}`,
		);

		return this?.options?.document?.total_data;
	}
	processBatch(limit, offset) {
		const self = this;
		return Promise.resolve()
			.then(() => {
				CommonHelper.logProgress(
					limit,
					limit + offset,
					this?.options?.document?.total_data,
					logger,
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}]`,
				);
				const query = `SELECT * FROM ${this.options.document.tmp_table} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectNewDwh.query(query);
			})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const objData = {};
					for (const val of Object.entries(this.options.fieldName)) {
						const value = row[val[1]];
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
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-v2-excel-export-report-cart-product-log-delete`,
	);

	const outputFile = file_name;
	const fieldName = {
		Date: 'created_at',
		Store: 'store_name_with_alias',
		'Cart ID': 'cart_id',
		'Product ID': 'product_id',
		'Product Refcode': 'product_reference',
		'Product Barcode': 'product_ean_no',
		'Product Name': 'product_name',
		Action: 'action',
		Source: 'source',
		'Updated By': 'created_by_email',
	};

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
		// Map only selected fields from document
		const tmp = objEntFieldName.reduce((acc, [, key]) => {
			acc[key] = doc[key];
			return acc;
		}, {});

		const row = this.worksheet.addRow(tmp);

		row.eachCell((cell, colNumber) => {
			// Apply black border to all cells
			cell.border = {
				top: { style: 'thin', color: { argb: 'FF000000' } },
				left: { style: 'thin', color: { argb: 'FF000000' } },
				bottom: { style: 'thin', color: { argb: 'FF000000' } },
				right: { style: 'thin', color: { argb: 'FF000000' } },
			};

			// Align all content to the left and vertically centered
			cell.alignment = { horizontal: 'left', vertical: 'middle' };

			// Format first column as date
			if (colNumber === 1 && cell.value instanceof Date) {
				cell.numFmt = 'dd/mmm/yyyy hh:mm:ss';
			} else if (cell.value != null) {
				cell.value = cell.value.toString();
			}
		});

		// Apply header styling on first row
		if (cnt === 1) {
			row.eachCell((cell) => {
				cell.font = { bold: true };
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFC5DEB5' },
				};
			});
		}

		row.commit();
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
			subject: 'Cart Product Log - Delete',
			is_export_excel: true,
		});
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('Cart Product Log - Delete');
	const columnWidths = [20, 30, 30, 10, 20, 20, 35, 10, 15, 30];

	worksheet.columns = objEntFieldName.map((el, idx) => {
		return {
			key: el[1],
			width: columnWidths[idx] || 20,
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

	// Create Temporary Table for processing data
	document.total_data = 0;
	if (criteria.queryRow) {
		const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
		logger.info(
			`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
		);
		const doQuery = await Promise.resolve(client.connectNewDwh.query(queryRow));
		document.total_data = doQuery?.rowCount || 0;
	}

	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	const task = new ExportExcelExportReportCartProductLogDelete({
		limit: 500,
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
		stopOnError: true,
		rejectOnError: true,
		fieldName,
		input,
	});

	try {
		await task.execute();
		input.push(null);
		await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

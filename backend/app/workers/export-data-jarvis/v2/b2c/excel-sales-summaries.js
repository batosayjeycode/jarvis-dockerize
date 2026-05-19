'use strict';

const Q = require('q');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2c-excel-sales-summaries' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');

class ExportExcelB2CSalesSummaries extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2c-excel-sales-summaries');
	}
	getTotalCount() {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this?.options?.document?.total_data}`,
			);
			return this?.options?.document?.total_data;
		}).catch((err) => {
			logger.error(err);
			throw err;
		});
	}
	processBatch(limit, offset) {
		const self = this;
		const order_groups = this.options.document.groups.map((g) =>
			g === 'business_unit' ? 'business_unit_new' : g === 'brand' ? 'brand_name' : g,
		);
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const order_by = this.options.document?.order_by || order_groups.join(' ASC, ');
			const order_by_type = this.options.document?.order_by_type ?? 'ASC';
			const query = `SELECT * FROM ${this.options.document.tmp_table} ORDER BY CASE WHEN field_name = 'Grandtotal' THEN 1 ELSE 0 END, ${order_by} ${order_by_type} LIMIT ${limit} OFFSET ${offset}`;
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const objData = {};
					for (const val of Object.entries(this.options.fieldName)) {
						let value = row[val[1]];
						switch (true) {
							case order_groups.includes(val[1]):
								value = row[val[1]];
								break;
							case val[1].includes('percent') || val[1] === 'time_gone':
								value = CommonHelper.formatPercentage(row[val[1]]);
								break;
							default:
								value = CommonHelper.zeroFormatNumber(row[val[1]]);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-v2-b2c-excel-sales-summaries`);
	const outputFile = file_name;
	const columns = [];

	document.excelTotalRows = 8;
	const dynamicFields = {};

	if (document?.groups?.length) {
		document?.groups.forEach((g) => {
			const key = g === 'business_unit' ? 'business_unit_new' : g === 'brand' ? 'brand_name' : g;
			const tmpKey = g === 'sales_team' ? 'Sales Team/Platform' : CommonHelper.removeUnderscoreAndCapitalize(g);
			dynamicFields[tmpKey] = key;
		});
	}
	const fieldName = {
		...dynamicFields,
		'Order | Gross': 'total_order_gross',
		'Order | Valid': 'total_order_valid',
		'Order | Net': 'total_order_net',
		'Qty | Gross': 'total_qty_gross',
		'Qty | Valid': 'total_qty_valid',
		'Qty | Net': 'total_qty_net',
		'NMV | Gross': 'nmv_gross',
		'NMV | Valid': 'nmv_valid',
		'NMV | Net': 'nmv_net',
		'Voucher | Gross': 'voucher_gross',
		'Voucher | Valid': 'voucher_valid',
		'Voucher | Net': 'voucher_net',
		'Net Revenue | Ach.': 'net_revenue_ach',
		'Net Revenue | Target': 'net_revenue_target',
		'Net Revenue | Ach. (%)': 'net_revenue_ach_percent',
		'Net Revenue | Ach. Gap': 'net_revenue_ach_gap',
		'Net Revenue | Time Gone': 'time_gone',
		'Net Revenue | Current Runrate': 'net_revenue_runrate',
		'Net Revenue | Runrate to Gap': 'net_revenue_runrate_gap',
		'Net Revenue | Ach. Est.': 'net_revenue_ach_est',
		'Net Revenue | Ach. Est. Gap': 'net_revenue_ach_est_gap',
		'Net Revenue | Ach. Est. (%)': 'net_revenue_ach_est_percent',
		AOV: 'aov',
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
		const tmp = objEntFieldName.reduce((acc, el) => {
			acc[el[1]] = doc[el[1]];
			return acc;
		}, {});
		const row = this.worksheet.addRow(tmp);

		if ((cnt >= 1 && cnt <= 8) || cnt == document.excelTotalRows) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).font = { bold: true };
			});
		}
		if (cnt === 8) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5DEB5' } };
			});
		}

		// add number format
		if (cnt > 8) {
			row.eachCell(function (cell, colNumber) {
				if (colNumber > document?.groups?.length) {
					row.getCell(colNumber).numFmt = '#,##0';
				}
			});
		}

		// add square border add last total
		if (cnt == document.excelTotalRows) {
			row.eachCell(function (cell, colNumber) {
				// Horizontal edges
				const b = {
					top: { style: 'thin', color: { argb: 'FF000000' } },
					bottom: { style: 'thin', color: { argb: 'FF000000' } },
				};

				// Vertical edges
				if (colNumber === 1) {
					b.left = { style: 'thin', color: { argb: 'FF000000' } };
				}
				cell.border = b;
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
			subject: 'Jarvis : Export B2C Sales Summary',
			is_export_excel: true,
		});
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('B2C Sales Summary');
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

	input.push({ [objEntFieldName[0][1]]: 'B2C Sales Summary' });
	input.push({
		[objEntFieldName[0][1]]: 'Start Date',
		[objEntFieldName[1][1]]: CommonHelper.formatDate(document.start_date),
	});
	input.push({
		[objEntFieldName[0][1]]: 'End Date',
		[objEntFieldName[1][1]]: CommonHelper.formatDate(document.end_date),
	});
	input.push({ [objEntFieldName[0][1]]: 'Filter', [objEntFieldName[1][1]]: document.export_label_filter_option });
	input.push({
		[objEntFieldName[0][1]]: 'Group By',
		[objEntFieldName[1][1]]: document.export_label_group_by_option,
	});
	input.push({ [objEntFieldName[0][1]]: '' });
	input.push({ [objEntFieldName[0][1]]: '' });
	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	// Create Temporary Table for processing data
	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${document.tmp_table} AS (${criteria.queryRow})`;
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] CREATING TABLE ${document.tmp_table} by ${context?.user?.email}}`,
	);
	const data = await Promise.resolve(client.connectNewDwh.query(queryRow));
	document.total_data = data?.rowCount || 0;
	document.excelTotalRows += document.total_data;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] TABLE ${document.tmp_table} CREATED`);

	const task = new ExportExcelB2CSalesSummaries({
		limit: 200,
		offset: 0,
		queryCount: criteria.queryRow,
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

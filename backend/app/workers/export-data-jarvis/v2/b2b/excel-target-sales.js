'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2b-excel-target-sales' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');
const moment = require('moment');
const formatDate = {
	yearly: 'YYYY',
	quarterly: '[Q]Q/YYYY',
	monthly: 'MMM/YYYY',
	daily: 'DD/MMM/YYYY', // Use 'MMM' for short month name like 'May'
};

class ExportExcelB2BTargetSales extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2b-excel-target-sales');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
				this.options.document.excelTotalRows += parseInt(result.rows[0].total);
				return parseInt(result.rows[0].total);
			})
			.catch((err) => {
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
			// Replace 'channel' with 'partner_channel' in the array
			const order_groups = this.options.document.groups.map((g) => (g === 'channel' ? 'partner_channel' : g));
			const order_by = this.options.document?.order_by || order_groups.join(' ASC, ');
			const order_by_type = this.options.document?.order_by_type ?? 'ASC';
			const query = `${this.options.queryRow} ORDER BY ${order_by} ${order_by_type} LIMIT ${limit} OFFSET ${offset}`;
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = (result?.rows || []).map((item) => {
					const cleanedItem = {};
					let sumNmv = 0;
					let sumNetRevenue = 0;

					for (const key in item) {
						if (key.startsWith('target_nmv_')) {
							const val = Number(item[key]) || 0;
							sumNmv += val;
						}
						if (key.startsWith('target_net_revenue_')) {
							const val = Number(item[key]) || 0;
							sumNetRevenue += val;
						}
						if (!key.startsWith('subtotal_') && !key.startsWith('grandtotal_')) {
							cleanedItem[key] = item[key];
						}
					}

					return {
						...cleanedItem,
						period_total_target_nmv: sumNmv,
						period_total_target_net_revenue: sumNetRevenue,
					};
				});

				for (const row of rows) {
					const objData = {};
					for (const [, key] of Object.entries(this.options.fieldName)) {
						const rawValue = row[key];
						const value = key.includes('target_') ? CommonHelper.zeroFormatNumber(rawValue, 0) : rawValue;

						objData[key] = value;
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-v2-b2b-excel-target-sales`);
	const outputFile = file_name;
	const columns = [];
	const { wrapQuery, grandtotalQuery } = criteria.queryRow;

	const optionalFieldsMap = {
		channel: 'partner_channel',
		sales_team: 'sales_team',
		brand: 'brand',
	};

	document.excelTotalRows = 11;
	const fieldName = {};
	const isQuarterly = ['quarterly', 'quarterly_period'].includes(document.period_type);
	if (document?.groups?.length > 0) {
		document?.groups.forEach((g) => {
			fieldName[CommonHelper.removeUnderscoreAndCapitalize(g)] = optionalFieldsMap[g];
		});
	}

	// Reusable helper to add period fields
	const addPeriodFields = (label, prefix, totalKey) => {
		for (const val of document.period_list) {
			const key = isQuarterly ? `${val.key}_${val.value}` : val?.key;
			const value = isQuarterly
				? `${label}\nQ${val.key}/${val.value}`
				: `${label} \n ${moment(val.value).format(formatDate[document?.period_type])}`;
			fieldName[value] = `${prefix}_${key}`;
		}
		fieldName[`${label}\nPeriod Total`] = totalKey;
	};

	addPeriodFields('NMV', 'target_nmv', 'period_total_target_nmv'); // Add NMV
	addPeriodFields('Net Revenue', 'target_net_revenue', 'period_total_target_net_revenue'); // Add NET REVENUE

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

	const groupLen = document?.groups?.length ?? 0;
	const periodLen = document?.period_list?.length ?? 0;
	const list_lines = [
		groupLen,
		groupLen + periodLen,
		groupLen + periodLen + 1,
		groupLen + 2 * periodLen + 1,
		groupLen + 2 * periodLen + 2,
	];

	ExcelTransform.prototype._transform = function (doc, encoding, callback) {
		const cnt = this._index++;
		const tmp = objEntFieldName.reduce((acc, el) => {
			acc[el[1]] = doc[el[1]];
			return acc;
		}, {});
		const row = this.worksheet.addRow(tmp);

		// add border in left of NMV, left and right of NMV Period Total, left and right of Net Revenue Period Total
		if (cnt >= 10) {
			row.eachCell(function (cell, colNumber) {
				const b = {};
				if (list_lines?.includes(colNumber)) {
					b.right = { style: 'thin', color: { argb: 'FF000000' } };
				}
				cell.border = b;
			});
		}

		if ((cnt >= 1 && cnt <= 10) || cnt == document.excelTotalRows) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).font = { bold: true };
			});
		}
		if (cnt === 10) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5DEB5' } };
				// Add word wrap
				row.getCell(colNumber).alignment = {
					wrapText: true,
					horizontal: 'left',
					vertical: 'top',
				};
			});
		}

		// add number format
		if (cnt > 10) {
			row.eachCell(function (cell, colNumber) {
				if (colNumber > document?.groups?.length) {
					row.getCell(colNumber).numFmt = '#,##0';
				}
			});
		}

		// add square border add last total
		if (cnt == document.excelTotalRows) {
			const lastCol = objEntFieldName.length;
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
				if (colNumber === lastCol || list_lines?.includes(colNumber)) {
					b.right = { style: 'thin', color: { argb: 'FF000000' } };
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
			subject: 'Jarvis : Export Sales Target',
			is_export_excel: true,
		});
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('Sales Target');
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

	input.push({ [objEntFieldName[0][1]]: 'Sales Target' });
	input.push({
		[objEntFieldName[0][1]]: 'Target Type',
		[objEntFieldName[1][1]]: CommonHelper.removeUnderscoreAndCapitalize(document?.target_type),
	});
	input.push({
		[objEntFieldName[0][1]]: 'Start Date',
		[objEntFieldName[1][1]]: CommonHelper.formatDate(document.start_date),
	});
	input.push({
		[objEntFieldName[0][1]]: 'End Date',
		[objEntFieldName[1][1]]: CommonHelper.formatDate(document.end_date),
	});
	input.push({
		[objEntFieldName[0][1]]: 'Period Type',
		[objEntFieldName[1][1]]: CommonHelper.removeUnderscoreAndCapitalize(document?.period_type),
	});
	input.push({ [objEntFieldName[0][1]]: 'Filter', [objEntFieldName[1][1]]: document.export_label_filter_option });
	input.push({
		[objEntFieldName[0][1]]: 'Target Combination',
		[objEntFieldName[1][1]]: document.export_label_group_by_option,
	});
	input.push({ [objEntFieldName[0][1]]: '' });
	input.push({ [objEntFieldName[0][1]]: '' });
	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	const task = new ExportExcelB2BTargetSales({
		limit: 500,
		offset: 0,
		queryRow: wrapQuery,
		queryCount: criteria.queryCount,
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

		// Input Grandtotal
		const grandtotal_data = await Promise.resolve(client.connectNewDwh.query(grandtotalQuery));
		const grand_total = {
			period_total_target_nmv: 0,
			period_total_target_net_revenue: 0,
		};

		const grandtotal_obj = grandtotal_data?.rows?.[0] || {};
		for (const key in grandtotal_obj) {
			if (key.startsWith('target_nmv_')) {
				grand_total.period_total_target_nmv += Number(grandtotal_obj[key]) || 0;
			} else if (key.startsWith('target_net_revenue_')) {
				grand_total.period_total_target_net_revenue += Number(grandtotal_obj[key]) || 0;
			}
		}

		const gt = { ...grand_total, ...grandtotal_obj };
		const objData = {};
		for (const [, key] of Object.entries(fieldName)) {
			const rawValue = gt[key];

			objData[key] = key.includes('target_') ? CommonHelper.formatNumber(rawValue, 0) : rawValue;
		}
		if (document?.groups?.length > 0) {
			document?.groups.forEach((_, i) => {
				objData[objEntFieldName[i][1]] = i == 0 ? 'Total' : '';
			});
		}
		input.push(objData);
		input.push(null);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

'use strict';

const fs = require('fs');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'v2-inventory-stock-report-details' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');

const PERMISSION_KEY = 'inventory-management.all-sociolla.stock-report';

const qtyDbKeys = [
	'pacman_on_hand_qty',
	'pacman_inbound_putaway_qty',
	'pacman_go_putaway_qty',
	'pacman_planning_qty',
	'pacman_planning_done_qty',
	'cerebro_on_hand_qty',
	'cerebro_reserved_qty',
	'cerebro_in_transit_qty',
	'cerebro_po_outstanding_qty',
	'cerebro_po_submit_qty',
	'friday_on_hand_qty',
	'friday_reserved_qty',
];
const numDbKeys = ['product_info_unit_cost', 'avg_daily_sales_optimum', 'avg_daily_sales', 'doi'];

function buildFieldName(isShowCogs) {
	const f = {
		'Jarvis Stock Level': 'jarvis_stocklevel_id',
		'Jarvis Stock Level Name': 'jarvis_stocklevel_name',
		'Pacman Warehouse': 'pacman_warehouse',
		'Location Category': 'jarvis_locationcategory_name',
		'Product Variant': 'product_variant',
		'Pacman | Location Category': 'pacman_location_category',
		'Pacman | Location Type': 'pacman_location_type',
		'Cerebro | Location Category': 'cerebro_location_category',
		'Cerebro | Warehouse': 'cerebro_warehouse',
		'Cerebro | Location': 'cerebro_location',
		'Friday | Location Category': 'friday_location_category',
	};
	if (isShowCogs) {
		f['Unit Cost'] = 'product_info_unit_cost';
	}
	f['Brand'] = 'product_info_brand';
	f['Brand Type'] = 'product_info_brand_type';
	f['Purchase Type'] = 'product_info_product_purchase_type';
	f['Classification'] = 'product_info_product_classification';
	f['Product Owner'] = 'product_info_product_owner';
	f['Product Status'] = 'product_info_product_status';
	f['Pacman | On Hand'] = 'pacman_on_hand_qty';
	f['Pacman | Inbound Putaway'] = 'pacman_inbound_putaway_qty';
	f['Pacman | Go Putaway'] = 'pacman_go_putaway_qty';
	f['Pacman | Planning'] = 'pacman_planning_qty';
	f['Pacman | Planning Done'] = 'pacman_planning_done_qty';
	f['Cerebro | On Hand'] = 'cerebro_on_hand_qty';
	f['Cerebro | Reserved'] = 'cerebro_reserved_qty';
	f['Cerebro | In Transit'] = 'cerebro_in_transit_qty';
	f['Cerebro | PO Outstanding'] = 'cerebro_po_outstanding_qty';
	f['Cerebro | PO Submit'] = 'cerebro_po_submit_qty';
	f['Friday | On Hand'] = 'friday_on_hand_qty';
	f['Friday | Reserved'] = 'friday_reserved_qty';
	f['Sales | AVG Daily Sales (Optimum)'] = 'avg_daily_sales_optimum';
	f['Sales | AVG Daily Sales'] = 'avg_daily_sales';
	f['Sales | DOI'] = 'doi';
	return f;
}

// Title rows: 1=title, 2=stock_date, 3=filter, 4=empty, 5=empty, 6=header → data from row 7
const HEADER_ROW_CNT = 6;

class ExportExcelStockReportDetails extends AbstractBatchTask {
	constructor(options) {
		super(options, 'v2-inventory-stock-report-details');
	}
	getTotalCount() {
		return Promise.resolve()
			.then(() => {
				logger.info(`[${this.options?.context?.user?.name}] Total: ${this?.options?.document?.total}`);
				return this?.options?.document?.total;
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		const self = this;
		return Promise.resolve()
			.then(() => {
				logger.info(`[${this.options?.context?.user?.name}] Batch picked:${limit} offset:${offset}`);
				const query = `SELECT * FROM ${this.options.document.tmp_table} LIMIT ${limit} OFFSET ${offset}`;
				return this.options.client.connectNewDwh.query(query);
			})
			.then((result) => {
				for (const row of result?.rows ?? []) {
					const objData = {};
					for (const [, dbKey] of self.options.objEntFieldName) {
						let value = row[dbKey];
						if (qtyDbKeys.includes(dbKey)) {
							value = value != null ? parseInt(value) : 0;
						} else if (numDbKeys.includes(dbKey)) {
							value = CommonHelper.zeroFormatNumber(value);
						} else {
							value = value ?? '';
						}
						objData[dbKey] = value;
					}
					self.options.input.push(objData);
				}
			})
			.then(() => {
				logger.info(`[${this.options?.context?.user?.name}] Done ${limit + offset}`);
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
		logger.error(`[${context?.user?.name}] Email '${criteria.send_to_email}' is not valid!`);
		return;
	}

	const client = message.client;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const { tmp_table, stock_date } = document;
	const queryCount = criteria.queryCount || null;

	logger.info(`[${context?.user?.name}] Start v2-inventory-stock-report-details`);

	const isShowCogs = CommonHelper.hasAccess(context, PERMISSION_KEY, 'read-cogs');
	const fieldName = buildFieldName(isShowCogs);
	const objEntFieldName = Object.entries(fieldName);
	const firstKey = objEntFieldName[0][1];
	const secondKey = objEntFieldName[1][1];

	const ExcelTransform = function (options) {
		stream.Transform.call(this, { writableObjectMode: true, readableObjectMode: false });
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
		const isGrandTotal = doc.__is_grand_total === true;
		const tmp = objEntFieldName.reduce((acc, [, dbKey]) => {
			acc[dbKey] = doc[dbKey];
			return acc;
		}, {});
		const row = this.worksheet.addRow(tmp);

		if ([1, 2, 3, HEADER_ROW_CNT].includes(cnt) || isGrandTotal) {
			row.eachCell((cell) => {
				cell.font = { bold: true };
			});
		}
		if (cnt === HEADER_ROW_CNT) {
			row.eachCell((cell) => {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5DEB5' } };
			});
		}
		if (cnt >= HEADER_ROW_CNT) {
			row.eachCell((cell) => {
				const borderStyle = isGrandTotal ? 'double' : 'thin';
				cell.border = Object.fromEntries(
					['top', 'bottom', 'left', 'right'].map((s) => [
						s,
						{ style: borderStyle, color: { argb: 'FF000000' } },
					]),
				);
			});
		}
		if (cnt > HEADER_ROW_CNT) {
			row.eachCell((cell, colNumber) => {
				const dbKey = objEntFieldName[colNumber - 1]?.[1];
				if (qtyDbKeys.includes(dbKey)) {
					cell.numFmt = '#,##0';
				} else if (numDbKeys.includes(dbKey)) {
					cell.numFmt = '#,##0.00';
				}
			});
		}

		this.worksheet.getRow(cnt).commit();
		callback();
	};

	ExcelTransform.prototype._flush = async function (callback) {
		await this.workbook.commit();
		workerHelpers.sendmail({
			logger,
			context,
			outputFile: file_name,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Platform Stock Detail',
			is_export_excel: true,
		});
		client.connectNewDwh.query(`DROP TABLE IF EXISTS ${tmp_table}`);
		logger.info(`${tmp_table} deleted, sent to ${criteria.send_to_email}`);
		callback();
	};

	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: file_name, useStyles: true });
	const worksheet = workbook.addWorksheet('Platform Stock Detail');
	worksheet.columns = objEntFieldName.map(([, dbKey]) => ({ key: dbKey, width: 22 }));

	const input = new stream.Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(new ExcelTransform({ workbook, worksheet })).pipe(process.stdout);

	input.push({ [firstKey]: 'Platform Stock Detail' });
	input.push({ [firstKey]: 'Stock Date', [secondKey]: CommonHelper.formatDate(stock_date) });
	input.push({ [firstKey]: 'Filter', [secondKey]: document?.export_label_filter_option || '' });
	input.push({ [firstKey]: '' });
	input.push({ [firstKey]: '' });
	const headerObj = objEntFieldName.reduce((acc, [label, dbKey]) => {
		acc[dbKey] = label;
		return acc;
	}, {});
	input.push(headerObj);

	const queryRow = `CREATE UNLOGGED TABLE IF NOT EXISTS ${tmp_table} AS (${criteria.queryRow})`;
	logger.info(`[${context?.user?.name}] CREATING TABLE ${tmp_table}`);
	const [tableResult, grandTotalResult] = await Promise.all([
		client.connectNewDwh.query(queryRow),
		queryCount ? client.connectNewDwh.query(queryCount) : Promise.resolve(null),
	]);
	document.total = tableResult?.rowCount || 0;
	const grandTotalRow = grandTotalResult?.rows?.[0] || null;
	logger.info(`[${context?.user?.name}] TABLE ${tmp_table} CREATED (${document.total} rows)`);

	const task = new ExportExcelStockReportDetails({
		limit: 500,
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
		objEntFieldName,
		input,
	});

	try {
		await task.execute();

		if (grandTotalRow) {
			const gtObj = { __is_grand_total: true, [firstKey]: 'Grand Total' };
			for (const [, dbKey] of objEntFieldName.slice(1)) {
				const rawValue =
					grandTotalRow[`grand_total_${dbKey}`] ?? (dbKey === 'doi' ? grandTotalRow['doi'] : null);
				if (qtyDbKeys.includes(dbKey)) {
					gtObj[dbKey] = rawValue != null ? parseInt(rawValue) : 0;
				} else if (numDbKeys.includes(dbKey)) {
					gtObj[dbKey] = CommonHelper.zeroFormatNumber(rawValue);
				} else {
					gtObj[dbKey] = '';
				}
			}
			input.push(gtObj);
		}

		input.push(null);
	} catch (error) {
		fs.rmSync(file_name, { force: true });
		logger.error(error);
		throw error;
	}
};

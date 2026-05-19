'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-sales-order-details' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');
const dateFields = ['document_date', 'net_document_date', 'valid_document_date'];
const percentFields = ['valid_conv', 'net_conv'];
const quantityFields = ['gross_qty', 'valid_qty', 'net_qty'];
const numberFields = [
	'gross_nmv',
	'gross_total_discount',
	'gross_net_revenue',
	'valid_nmv',
	'valid_total_discount',
	'valid_net_revenue',
	'net_nmv',
	'net_total_discount',
	'net_net_revenue',
	'amount_due',
];
const thinBlack = { style: 'thin', color: { argb: 'FF000000' } };

class ExportExcelSalesOrderDetails extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-sales-order-details');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(
				`SELECT COUNT(DISTINCT document_reference) AS total_rows FROM ${this.options.document.tmp_table}`,
			);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total_rows}`,
				);
				return parseInt(result.rows[0].total_rows);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			const query = `
				SELECT DISTINCT
					document_date,
					document_reference
				FROM
					${this.options.document.tmp_table}
				ORDER BY
					document_date ASC,
					document_reference ASC
				LIMIT
						${limit}
					OFFSET
						${offset}`;
			return Q.resolve(this.options.client.connectNewDwh.query(query));
		})
			.then((references) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
				);
				const refs = (references?.rows || []).map((item) => item.document_reference);
				const query_rows = `
				SELECT
					*
				FROM
					${this.options.document.tmp_table}
				WHERE
					document_reference IN ('${refs.join("','")}')
				ORDER BY
					document_date ASC,
					document_reference ASC,
					valid_document_date ASC,
					valid_document_reference ASC,
					net_document_date ASC,
					net_document_reference ASC`;

				return Q.resolve(this.options.client.connectNewDwh.query(query_rows));
			})
			.then((result) => {
				const rows = result?.rows ?? [];
				const doCollectData = (rows) => {
					this.options.document.all_net_document_reference = [];
					this.options.document.all_valid_document_reference = [];
					for (let i = 0; i < rows.length; i++) {
						if (
							!this.options.document.all_net_document_reference.includes(rows[i].net_document_reference)
						) {
							this.options.document.all_net_document_reference.push(rows[i].net_document_reference);
						}
						if (
							!this.options.document.all_valid_document_reference.includes(
								rows[i].valid_document_reference,
							)
						) {
							this.options.document.all_valid_document_reference.push(rows[i].valid_document_reference);
						}
					}
				};

				for (let i = 0; i < rows.length; i++) {
					// set default array and doCollectData if document reference is not same as before
					if (this.options.document.gross_document_reference != rows[i].document_reference) {
						this.options.document.net_document_reference = [];
						this.options.document.valid_document_reference = [];
						const dataToCheck = rows.filter(
							(data) => data.document_reference == rows[i].document_reference,
						);
						doCollectData(dataToCheck);
					}

					const isDuplicate =
						this.options.document.gross_document_reference == rows[i].document_reference &&
						this.options.document.net_document_reference.includes(rows[i].net_document_reference) &&
						this.options.document.valid_document_reference.includes(rows[i].valid_document_reference);

					if (!isDuplicate) {
						const isNetExist = this.options.document.net_document_reference.includes(
							rows[i].net_document_reference,
						);
						const isValidExist = this.options.document.valid_document_reference.includes(
							rows[i].valid_document_reference,
						);
						const arrNetAvailable = this.options.document.all_net_document_reference.filter(
							(el) => !this.options.document.net_document_reference.includes(el),
						);
						const arrValidAvailable = this.options.document.all_valid_document_reference.filter(
							(el) => !this.options.document.valid_document_reference.includes(el),
						);

						if (!isNetExist) {
							this.options.document.net_document_reference.push(rows[i].net_document_reference);
						} else if (arrNetAvailable?.[0]) {
							this.options.document.net_document_reference.push(arrNetAvailable[0]);
							const findData = rows.find(
								(data) =>
									data.net_document_reference == arrNetAvailable[0] &&
									this.options.document.gross_document_reference == rows[i].document_reference,
							);
							rows[i].net_document_reference = arrNetAvailable[0];
							rows[i].net_document_date = findData?.net_document_date || '';
							rows[i].net_qty = findData?.net_qty || '';
							rows[i].net_nmv = findData?.net_nmv || '';
							rows[i].net_total_discount = findData?.net_total_discount || '';
							rows[i].net_net_revenue = findData?.net_net_revenue || '';
							rows[i].net_conv = findData?.net_conv || '';
						} else {
							rows[i].net_document_reference = '';
							rows[i].net_document_date = '';
							rows[i].net_qty = '';
							rows[i].net_nmv = '';
							rows[i].net_total_discount = '';
							rows[i].net_net_revenue = '';
							rows[i].net_conv = '';
							rows[i].amount_due = '';
						}

						if (!isValidExist) {
							this.options.document.valid_document_reference.push(rows[i].valid_document_reference);
						} else if (arrValidAvailable?.[0]) {
							this.options.document.valid_document_reference.push(arrValidAvailable[0]);
							const findData = rows.find(
								(data) =>
									data.valid_document_reference == arrValidAvailable[0] &&
									this.options.document.gross_document_reference == rows[i].document_reference,
							);
							rows[i].valid_document_reference = arrValidAvailable[0];
							rows[i].valid_document_date = findData?.valid_document_date || '';
							rows[i].valid_qty = findData?.valid_qty || '';
							rows[i].valid_nmv = findData?.valid_nmv || '';
							rows[i].valid_total_discount = findData?.valid_total_discount || '';
							rows[i].valid_net_revenue = findData?.valid_net_revenue || '';
							rows[i].valid_conv = findData?.valid_conv || '';
						} else {
							rows[i].valid_document_reference = '';
							rows[i].valid_document_date = '';
							rows[i].valid_qty = '';
							rows[i].valid_nmv = '';
							rows[i].valid_total_discount = '';
							rows[i].valid_net_revenue = '';
							rows[i].valid_conv = '';
						}

						if (rows[i].net_document_reference === null && rows[i].valid_document_reference === null) {
							rows[i].net_document_reference = '';
							rows[i].net_document_date = '';
							rows[i].valid_document_reference = '';
							rows[i].valid_document_date = '';
						}

						this.options.document.gross_document_reference = rows[i].document_reference;

						if (!this.options.document.uniqueGross.has(rows[i].document_reference)) {
							this.options.document.uniqueGross.add(rows[i].document_reference);
						} else {
							rows[i].document_reference = '';
							rows[i].document_date = '';
							rows[i].customer_id = '';
							rows[i].customer_name = '';
							rows[i].channel = '';
							rows[i].type = '';
							rows[i].account = '';
							rows[i].city = '';
							rows[i].province = '';
							rows[i].payment_term = '';
							rows[i].sales_team = '';
							rows[i].sales_person = '';
							rows[i].gross_qty = '';
							rows[i].gross_nmv = '';
							rows[i].gross_total_discount = '';
							rows[i].gross_net_revenue = '';
						}

						const objData = {};
						for (const val of Object.entries(this.options.fieldName)) {
							let value = rows[i][val[1]];

							switch (true) {
								case numberFields.includes(val[1]):
									value = value ? CommonHelper.zeroFormatNumber(value) : '';
									break;
								case dateFields.includes(val[1]):
									value = CommonHelper.formatDate(value);
									break;
								case quantityFields.includes(val[1]):
									value = value ? parseInt(value) : '';
									break;
								case percentFields.includes(val[1]):
									value = value ? parseFloat(value) / 100 : '';
									break;
							}
							objData[val[1]] = value ? value : '';
						}
						self.options.input.push(objData);
					}
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

	document.uniqueGross = new Set();
	document.gross_document_reference = '';
	document.net_document_reference = [];
	document.valid_document_reference = [];
	document.all_net_document_reference = [];
	document.all_valid_document_reference = [];

	const outputFile = file_name;
	const fieldName = {
		'Document Reference': 'document_reference',
		'Document Date': 'document_date',
		'Customer ID': 'customer_id',
		Customer: 'customer_name',
		'Parent Customer': 'parent_customer',
		Channel: 'channel',
		Type: 'type',
		Account: 'account',
		City: 'city',
		Province: 'province',
		'Payment Term': 'payment_term',
		'Sales Team': 'sales_team',
		Salesperson: 'sales_person',
		'Gross | Qty': 'gross_qty',
		'Gross | NMV Before Discount': 'gross_nmv',
		'Gross | Total Discount': 'gross_total_discount',
		'Gross | Net Revenue': 'gross_net_revenue',
		'Valid | Document Reference': 'valid_document_reference',
		'Valid | Document Date': 'valid_document_date',
		'Valid | Qty': 'valid_qty',
		'Valid | NMV Before Discount': 'valid_nmv',
		'Valid | Total Discount': 'valid_total_discount',
		'Valid | Net Revenue': 'valid_net_revenue',
		'Valid | Conv.': 'valid_conv',
		'Net | Document Reference': 'net_document_reference',
		'Net | Document Date': 'net_document_date',
		'Net | Qty': 'net_qty',
		'Net | NMV Before Discount': 'net_nmv',
		'Net | Total Discount': 'net_total_discount',
		'Net | Net Revenue': 'net_net_revenue',
		'Net | Conv.': 'net_conv',
		'Net | Amount Due': 'amount_due',
	};

	const widths = [
		30, 15, 10, 30, 30, 10, 10, 15, 15, 15, 15, 15, 15, 15, 20, 20, 20, 30, 15, 15, 20, 20, 20, 15, 30, 15, 15, 20,
		20, 20, 15, 20,
	];
	const columns = widths.map((w) => ({ width: w }));
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
		if ([1, 2, 3, 4, 5, 7].includes(cnt)) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).font = { bold: true };
			});
		}
		if (cnt === 7) {
			row.eachCell(function (cell, colNumber) {
				row.getCell(colNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5DEB5' } };
			});
		}

		// add border
		if (cnt > 6) {
			row.eachCell(function (cell, colNumber) {
				cell.border = Object.fromEntries(['top', 'bottom', 'left', 'right'].map((side) => [side, thinBlack]));
			});
		}

		// add number format
		if (cnt > 7) {
			row.eachCell(function (cell, colNumber) {
				if ([15, 16, 17, 21, 22, 23, 28, 29, 30, 32].includes(colNumber)) {
					row.getCell(colNumber).numFmt = '#,##0.00';
				}
				if ([14, 20, 27].includes(colNumber)) {
					row.getCell(colNumber).numFmt = '#,##0';
				}
				if ([24, 31].includes(colNumber)) {
					row.getCell(colNumber).numFmt = '0.00%';
				}
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
			subject: 'Jarvis : Export Sales Order with Valid and Net',
			is_export_excel: true,
		});
		client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('Sales Order with Valid and Net');
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

	input.push({ document_reference: 'Sales Order with Valid and Net' });
	input.push({ document_reference: 'Start Date', document_date: CommonHelper.formatDate(document.start_date) });
	input.push({ document_reference: 'End Date', document_date: CommonHelper.formatDate(document.end_date) });
	input.push({ document_reference: 'Filter', document_date: document.export_label_filter_option });
	input.push({ document_reference: '' });
	input.push({ document_reference: '' });
	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	const task = new ExportExcelSalesOrderDetails({
		limit: 10,
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

		// Values from fieldName (in order)
		const fieldValues = Object.values(fieldName);

		// 1-based index list to replace with a blank value for ExcelJS borders
		const targetIndexes = [
			...Array.from({ length: 11 }, (_, i) => i + 2), // 2 to 12
			17,
			18,
			24,
			25,
		];

		// Loop through values (1-based index)
		fieldValues.forEach((value, index) => {
			const pos = index + 1;

			// If this value position is in the target index list
			if (targetIndexes.includes(pos)) {
				// ExcelJS cannot border empty string, so use a space
				document.grand_total[value] = '';
			}
		});

		document.grand_total['document_reference'] = 'Total';
		const objData = {};
		for (const val of Object.entries(fieldName)) {
			let value = document.grand_total[val[1]];

			switch (true) {
				case numberFields.includes(val[1]):
					value = value ? CommonHelper.zeroFormatNumber(value) : '';
					break;
				case dateFields.includes(val[1]):
					value = CommonHelper.formatDate(value);
					break;
				case quantityFields.includes(val[1]):
					value = value ? parseInt(value) : '';
					break;
				case percentFields.includes(val[1]):
					value = value ? parseFloat(value) / 100 : '';
					break;
			}
			objData[val[1]] = value;
		}
		input.push(objData);
		input.push(null);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

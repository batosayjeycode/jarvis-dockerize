'use strict';

const Q = require('q');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-excel-sinclair-sssg-rules' });
const CommonHelper = require('../../../../helpers/commonHelper');
const workerHelpers = require('../../../../helpers/workerHelper');
const stream = require('stream');
const util = require('util');
const Excel = require('exceljs');

class ExportExcelSssgRules extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-excel-sinclair-sssg-rules');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryRow);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total_data}`,
				);
				return parseInt(result.rows[0].total_data);
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result?.rows || [];

				for (const row of rows) {
					const objData = {};
					for (const [, key] of Object.entries(this.options.fieldName)) {
						const rawValue = row[key];
						const value = key == 'opening_date' ? CommonHelper.formatDate(rawValue) : rawValue;

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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-v2-excel-sinclair-sssg-rules`);
	const outputFile = file_name;
	const columns = [{ width: 25 }, { width: 30 }, { width: 15 }, { width: 15 }, { width: 10 }];

	document.excelTotalRows = 11;
	const fieldName = {
		'Store ID': 'store_id',
		'Store Name': 'store_name',
		'Opening Date': 'opening_date',
		Country: 'country',
		Active: 'is_active',
	};

	const year_range = CommonHelper.getYearRange(Number(document.start_year), Number(document.end_year));
	year_range.forEach((y) => {
		fieldName[`Comp. Store Status | Year ${y}`] = `comp_${y}`;
	});

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
		if (cnt === 1) {
			row.eachCell((cell) => {
				cell.font = { bold: true };
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFD9D8D9' },
				};
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
			subject: 'Jarvis : Export SSSG Rule',
			is_export_excel: true,
		});
	};

	// it's better to provide the workbook as a parameter to the ExcelTransform
	const workbook = new Excel.stream.xlsx.WorkbookWriter({ filename: outputFile, useStyles: true });
	const worksheet = workbook.addWorksheet('SSSG Rule');
	worksheet.columns = objEntFieldName.map((el, idx) => {
		return {
			key: el[1],
			width: columns[idx]?.width || 15,
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

	const objTitle = objEntFieldName.reduce((acc, el) => {
		acc[el[1]] = el[0];
		return acc;
	}, {});
	input.push(objTitle);

	const task = new ExportExcelSssgRules({
		limit: 500,
		offset: 0,
		queryRow: criteria.queryRow,
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
		input.push(null);
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

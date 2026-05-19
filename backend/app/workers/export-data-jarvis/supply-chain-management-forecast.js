'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-scm-forecast' });
const workerHelpers = require('../../helpers/workerHelper');
const fields = [
	'SKU',
	'Brand',
	'Channel',
	'M0',
	'M1',
	'M2',
	'M3',
	'M4',
	'M5',
	'M6',
	'M7',
	'M8',
	'M9',
	'M10',
	'M11',
	'M12',
	'TOTAL',
];

class ScmForecast extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-scm-forecast');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 2000`);
		return Q.resolve(2000);
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const res = {};
				if (result.rows && result.rows.length) {
					result.rows.forEach((row) => {
						const keys = row.reference;
						if (!res[keys]) {
							res[keys] = { reference: row.reference, brand: row.brand };
						}
						if (!res[keys][row.channel]) {
							res[keys][row.channel] = {};
						}

						const qty =
							row.index_period === 'M0'
								? parseInt(row.system_forecast)
								: parseInt(row.forecast_stock_qty);
						res[keys][row.channel][row.index_period] = qty || 0;
					});
				}

				for (const row in res) {
					self.options.csv.push({
						SKU: res[row].reference,
						Brand: res[row].brand,
						Channel: 'Online',
						M0: res[row]['Online'].M0,
						M1: res[row]['Online'].M1,
						M2: res[row]['Online'].M2,
						M3: res[row]['Online'].M3,
						M4: res[row]['Online'].M4,
						M5: res[row]['Online'].M5,
						M6: res[row]['Online'].M6,
						M7: res[row]['Online'].M7,
						M8: res[row]['Online'].M8,
						M9: res[row]['Online'].M9,
						M10: res[row]['Online'].M10,
						M11: res[row]['Online'].M11,
						M12: res[row]['Online'].M12,
						TOTAL:
							res[row]['Online'].M0 +
							res[row]['Online'].M1 +
							res[row]['Online'].M2 +
							res[row]['Online'].M3 +
							res[row]['Online'].M4 +
							res[row]['Online'].M5 +
							res[row]['Online'].M6 +
							res[row]['Online'].M7 +
							res[row]['Online'].M8 +
							res[row]['Online'].M9 +
							res[row]['Online'].M10 +
							res[row]['Online'].M11 +
							res[row]['Online'].M12,
					});

					self.options.csv.push({
						SKU: '',
						Brand: '',
						Channel: 'Offline',
						M0: res[row]['Offline'].M0,
						M1: res[row]['Offline'].M1,
						M2: res[row]['Offline'].M2,
						M3: res[row]['Offline'].M3,
						M4: res[row]['Offline'].M4,
						M5: res[row]['Offline'].M5,
						M6: res[row]['Offline'].M6,
						M7: res[row]['Offline'].M7,
						M8: res[row]['Offline'].M8,
						M9: res[row]['Offline'].M9,
						M10: res[row]['Offline'].M10,
						M11: res[row]['Offline'].M11,
						M12: res[row]['Offline'].M12,
						TOTAL:
							res[row]['Offline'].M0 +
							res[row]['Offline'].M1 +
							res[row]['Offline'].M2 +
							res[row]['Offline'].M3 +
							res[row]['Offline'].M4 +
							res[row]['Offline'].M5 +
							res[row]['Offline'].M6 +
							res[row]['Offline'].M7 +
							res[row]['Offline'].M8 +
							res[row]['Offline'].M9 +
							res[row]['Offline'].M10 +
							res[row]['Offline'].M11 +
							res[row]['Offline'].M12,
					});

					self.options.csv.push({
						SKU: '',
						Brand: '',
						Channel: 'GT',
						M0: res[row]['GT'].M0,
						M1: res[row]['GT'].M1,
						M2: res[row]['GT'].M2,
						M3: res[row]['GT'].M3,
						M4: res[row]['GT'].M4,
						M5: res[row]['GT'].M5,
						M6: res[row]['GT'].M6,
						M7: res[row]['GT'].M7,
						M8: res[row]['GT'].M8,
						M9: res[row]['GT'].M9,
						M10: res[row]['GT'].M10,
						M11: res[row]['GT'].M11,
						M12: res[row]['GT'].M12,
						TOTAL:
							res[row]['GT'].M0 +
							res[row]['GT'].M1 +
							res[row]['GT'].M2 +
							res[row]['GT'].M3 +
							res[row]['GT'].M4 +
							res[row]['GT'].M5 +
							res[row]['GT'].M6 +
							res[row]['GT'].M7 +
							res[row]['GT'].M8 +
							res[row]['GT'].M9 +
							res[row]['GT'].M10 +
							res[row]['GT'].M11 +
							res[row]['GT'].M12,
					});

					self.options.csv.push({
						SKU: '',
						Brand: '',
						Channel: 'MT',
						M0: res[row]['MT'].M0,
						M1: res[row]['MT'].M1,
						M2: res[row]['MT'].M2,
						M3: res[row]['MT'].M3,
						M4: res[row]['MT'].M4,
						M5: res[row]['MT'].M5,
						M6: res[row]['MT'].M6,
						M7: res[row]['MT'].M7,
						M8: res[row]['MT'].M8,
						M9: res[row]['MT'].M9,
						M10: res[row]['MT'].M10,
						M11: res[row]['MT'].M11,
						M12: res[row]['MT'].M12,
						TOTAL:
							res[row]['MT'].M0 +
							res[row]['MT'].M1 +
							res[row]['MT'].M2 +
							res[row]['MT'].M3 +
							res[row]['MT'].M4 +
							res[row]['MT'].M5 +
							res[row]['MT'].M6 +
							res[row]['MT'].M7 +
							res[row]['MT'].M8 +
							res[row]['MT'].M9 +
							res[row]['MT'].M10 +
							res[row]['MT'].M11 +
							res[row]['MT'].M12,
					});

					self.options.csv.push({
						SKU: '',
						Brand: '',
						Channel: 'Edit',
						M0: res[row]['Edit'].M0,
						M1: res[row]['Edit'].M1,
						M2: res[row]['Edit'].M2,
						M3: res[row]['Edit'].M3,
						M4: res[row]['Edit'].M4,
						M5: res[row]['Edit'].M5,
						M6: res[row]['Edit'].M6,
						M7: res[row]['Edit'].M7,
						M8: res[row]['Edit'].M8,
						M9: res[row]['Edit'].M9,
						M10: res[row]['Edit'].M10,
						M11: res[row]['Edit'].M11,
						M12: res[row]['Edit'].M12,
						TOTAL:
							res[row]['Edit'].M0 +
							res[row]['Edit'].M1 +
							res[row]['Edit'].M2 +
							res[row]['Edit'].M3 +
							res[row]['Edit'].M4 +
							res[row]['Edit'].M5 +
							res[row]['Edit'].M6 +
							res[row]['Edit'].M7 +
							res[row]['Edit'].M8 +
							res[row]['Edit'].M9 +
							res[row]['Edit'].M10 +
							res[row]['Edit'].M11 +
							res[row]['Edit'].M12,
					});
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
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis scm-forecast`);

	const outputFile = file_name;
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ScmForecast({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		stopOnError: true,
		rejectOnError: true,
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
			subject: 'Export SCM Forecast',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

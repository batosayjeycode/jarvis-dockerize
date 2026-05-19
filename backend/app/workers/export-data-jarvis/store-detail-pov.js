'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-store-detail-pov' });
const workerHelpers = require('../../helpers/workerHelper');

class StoreDetailPovCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-store-detail-pov');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total}`,
				);
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
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (el[1] === 'user_conversion_by_period') {
							row[el[1]] =
								(parseInt(row.user_shopped) &&
									parseInt(row.user_registered) &&
									parseFloat(
										Number.parseFloat(
											(parseInt(row.user_shopped) / parseInt(row.user_registered)) * 100,
										).toFixed(2),
									)) ||
								0;
						} else if (el[1] === 'user_conversion_all_time') {
							row[el[1]] =
								(parseInt(row.all_time_user_shopped) &&
									parseInt(row.all_time_user_registered) &&
									parseFloat(
										Number.parseFloat(
											(parseInt(row.all_time_user_shopped) /
												parseInt(row.all_time_user_registered)) *
												100,
										).toFixed(2),
									)) ||
								0;
						} else if (el[1] === 'firstname_cashier') {
							row[el[1]] = `${row.firstname_cashier} ${row.lastname_cashier}`;
						}
						acc[el[0]] = row[el[1]] || null;
						return acc;
					}, {});
					self.options.csv.push(data);
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-store-detail-pov`);

	const fieldName = {
		NAME: 'firstname_cashier',
		'UNIQUE ID': 'cashier_code',
		POSITION: 'cashier_role',
		'STORE NAME': 'store_name',
		'USER REGISTERED': 'user_registered',
		'USER CONVERSION BY PERIOD': 'user_conversion_by_period',
		'VALUE BY PERIOD': 'value_by_period',
		'USER CONVERSION ALL TIME': 'user_conversion_all_time',
		'VALUE ALL TIME': 'all_time_value',
	};

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new StoreDetailPovCsv({
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
		document,
		fieldName,
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
			subject: 'Export Store Detail POV',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

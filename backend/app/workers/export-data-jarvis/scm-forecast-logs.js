'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
const { ObjectId } = require('mongodb');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-scm-forecast-logs' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportScmForecastLogs extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-scm-forecast-logs');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 1`);
		return Q.resolve(1);
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			return (
				this.options.clientJarvis
					.db(process.env.JARVIS_MONGODB)
					.collection('scm_forecast_logs')
					.find({ _id: new ObjectId(this.options.filter._id) })
					// .find(ObjectId(this.options.filter._id))
					.project({
						user: 1,
						products: 1,
						action: 1,
					})
					.toArray()
			);
		}).then((result) => {
			const logs = result[0].products || [];
			for (const log of logs) {
				self.options.csv.push({
					reference: log.reference,
					channel: log.channel,
					period: moment(log.period).tz('Asia/Jakarta').format('YYYY-MM-DD'),
					forecast_before: log.forecast_before,
					forecast_after: log.forecast_after,
				});
			}
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
	const filter = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis scm-forecast-logs`);

	const outputFile = file_name;
	const fields = ['reference', 'channel', 'period', 'forecast_before', 'forecast_after'];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportScmForecastLogs({
		limit: 500,
		offset: 0,
		filter,
		context,
		client,
		clientJarvis: clientJarvis,
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
			subject: 'Jarvis Export SCM Forecast Logs',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

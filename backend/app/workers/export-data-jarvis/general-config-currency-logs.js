'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-general-config-currency-logs' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportGeneralConfigCurrencyLogs extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-general-config-currency-logs');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('currency_logs')
				.countDocuments(this.options.filter);
		}).then((total) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${total}`,
			);
			return total;
		});
	}
	processBatch(limit, offset) {
		const self = this;
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('currency_logs')
				.find(this.options.filter)
				.project({
					user: 1,
					action: 1,
					data: 1,
					created_at: 1,
				})
				.sort({ created_at: -1 })
				.limit(limit)
				.skip(offset)
				.toArray();
		}).then((logs) => {
			for (const log of logs) {
				self.options.csv.push({
					timestamp: moment(log.created_at).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
					user_id: log.user.id,
					user_name: log.user.name,
					action: log.action,
					id: log.data.id,
					currency: log.data.currency,
					notes: log.data.notes,
					is_default: log.data.is_default,
					is_active: log.data.is_active,
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis general-config-currency-logs`);

	if (filter?.created_at && filter?.created_at['$gte']) {
		filter.created_at['$gte'] = moment(new Date(filter.created_at['$gte'])).toDate();
	}
	if (filter?.created_at && filter?.created_at['$lte']) {
		filter.created_at['$lte'] = moment(new Date(filter.created_at['$lte'])).toDate();
	}

	const outputFile = file_name;
	const fields = [
		'timestamp',
		'user_id',
		'user_name',
		'action',
		'id',
		'currency',
		'notes',
		'is_default',
		'is_active',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportGeneralConfigCurrencyLogs({
		limit: 500,
		offset: 0,
		filter: filter,
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
			subject: 'Jarvis Export General Config Currency Logs',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

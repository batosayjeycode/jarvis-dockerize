'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
let number = 1;
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-general-config-users' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportGeneralConfigUsers extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-general-config-users');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('users')
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
				.collection('users')
				.find(this.options.filter)
				.project({ id: 1, user_name: 1, user_email: 1, is_active: 1, role_name: 1, created_at: 1 })
				.sort({ created_at: -1 })
				.limit(limit)
				.skip(offset)
				.toArray();
		}).then((users) => {
			for (const user of users) {
				self.options.csv.push({
					no: number,
					user_name: user.user_name,
					user_email: user.user_email,
					user_status: user.is_active ? 'active' : 'inactive',
					role_name: user.role_name,
					registered_at: moment(user.created_at).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
				});
				number++;
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis general-config-users`);

	const outputFile = file_name;
	const fields = ['no', 'user_name', 'user_email', 'user_status', 'role_name', 'registered_at'];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportGeneralConfigUsers({
		limit: 500,
		offset: 0,
		filter: (criteria.document && JSON.parse(criteria.document)) || {},
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
			subject: 'Jarvis Export General Config Users',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

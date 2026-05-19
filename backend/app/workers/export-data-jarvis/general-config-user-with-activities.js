'use strict';

const Q = require('q');
const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
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
		let user_data = [];
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('users')
				.find(this.options.filter)
				.project({
					id: 1,
					user_name: 1,
					user_email: 1,
					is_active: 1,
					role_name: 1,
					created_at: 1,
					created_by: 1,
					updated_at: 1,
					updated_by: 1,
				})
				.sort({ created_at: -1 })
				.limit(limit)
				.skip(offset)
				.toArray();
		})
			.then((users) => {
				user_data = users;
				const userIds = users.map((u) => u._id);

				return Q.all(
					userIds.map((id) =>
						this.options.clientJarvis
							.db(process.env.JARVIS_MONGODB)
							.collection('user_logs')
							.find({ user_id: id })
							.project({ user_name: 1, user_email: 1, user_id: 1, created_at: 1 })
							.sort({ created_at: -1 })
							.limit(1)
							.toArray(),
					),
				);
			})
			.then((activities) => {
				const hashByUserId = activities.reduce((acc, arr) => {
					if (arr.length > 0) {
						const doc = arr[0];
						acc[doc.user_id.toString()] = doc;
					}
					return acc;
				}, {});

				for (const user of user_data) {
					self.options.csv.push({
						username: user.user_name,
						'login (email)': user.user_email,
						'user role': user.role_name,
						'active status': user.is_active ? 'active' : 'inactive',
						'created at': moment(user.created_at).tz('Asia/Jakarta').format('DD/MMM/YYYY HH:mm:ss'),
						'created by': user?.created_by?.name,
						'last updated at': moment(user.updated_at).tz('Asia/Jakarta').format('DD/MMM/YYYY HH:mm:ss'),
						'last updated by': user?.updated_by?.name,
						'last activity at': hashByUserId[user._id]
							? moment(hashByUserId[user._id].created_at)
									.tz('Asia/Jakarta')
									.format('DD/MMM/YYYY HH:mm:ss')
							: '',
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis general-config-users`);

	const outputFile = file_name;
	const fields = [
		'username',
		'login (email)',
		'user role',
		'active status',
		'created at',
		'created by',
		'last updated at',
		'last updated by',
		'last activity at',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportGeneralConfigUsers({
		limit: 20,
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

'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-general-config-user-roles' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportGeneralConfigUserRoles extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-general-config-user-roles');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('user_roles')
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
				.collection('user_roles')
				.find(this.options.filter)
				.project({
					id: 1,
					role_name: 1,
					role_desc: 1,
					total_user_applied: 1,
					user_applied: 1,
					is_monitored: 1,
					is_deleted: 1,
					created_at: 1,
					updated_at: 1,
					deleted_at: 1,
				})
				.sort({ id: 1 })
				.limit(limit)
				.skip(offset)
				.toArray();
		}).then((roles) => {
			for (const role of roles) {
				self.options.csv.push({
					id: role.id,
					role_name: role.role_name,
					role_desc: role.role_desc,
					total_user_applied: role.total_user_applied,
					active_user_applied: role.user_applied,
					is_monitored: role.is_monitored ? 'yes' : 'no',
					is_deleted: role.is_deleted ? 'yes' : 'no',
					created_at: moment(role.created_at).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
					updated_at: moment(role.updated_at).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss'),
					deleted_at: role.is_deleted
						? moment(role.deleted_at).tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss')
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis general-config-user-roles`);

	const outputFile = file_name;
	const fields = [
		'id',
		'role_name',
		'role_desc',
		'total_user_applied',
		'active_user_applied',
		'is_monitored',
		'is_deleted',
		'created_at',
		'updated_at',
		'deleted_at',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportGeneralConfigUserRoles({
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
			subject: 'Jarvis Export General Config User Roles',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

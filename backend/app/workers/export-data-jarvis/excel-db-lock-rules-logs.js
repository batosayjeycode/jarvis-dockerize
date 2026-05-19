'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment-timezone');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-db-lock-rules-logs' });
const workerHelpers = require('../../helpers/workerHelper');
const writeXlsxFile = require('write-excel-file/node');

class ExportExcelDbLockRulesLogs extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-db-lock-rules-logs');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.clientJarvis
				.db(process.env.JARVIS_MONGODB)
				.collection('db_lock_rules_logs')
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
				.collection('db_lock_rules_logs')
				.find(this.options.filter)
				.project({
					user: 1,
					user_role: 1,
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
				const createdAt = new Date(log.created_at);
				createdAt.setHours(createdAt.getHours() + 7);
				const data = [
					{
						value: createdAt,
						borderColor: '#000000',
						type: Date,
						format: 'dd/mmm/yyyy hh:mm:ss',
						align: 'left',
					},
					{
						value: log.user.email,
						borderColor: '#000000',
						align: 'left',
					},
					{
						value: log.user_role.name,
						borderColor: '#000000',
						align: 'left',
					},
					{
						value: log.action,
						borderColor: '#000000',
						align: 'center',
					},
					{
						value: `ID: ${log.data.id}, Table Name: ${log.data.table_name}, Lock Date Field: ${log.data.lock_field}, Lock Rule (Days): ${log.data.lock_period}`,
						borderColor: '#000000',
						align: 'left',
					},
				];
				self.options.data.push(data);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis db-lock-rules-logs`);

	if (filter?.created_at && filter?.created_at['$gte']) {
		filter.created_at['$gte'] = moment(new Date(filter.created_at['$gte'])).toDate();
	}
	if (filter?.created_at && filter?.created_at['$lte']) {
		filter.created_at['$lte'] = moment(new Date(filter.created_at['$lte'])).toDate();
	}

	const HEADER_ROW = [
		{
			value: 'Time Stamp',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'left',
		},
		{
			value: 'User Email',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'left',
		},
		{
			value: 'User Role',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'left',
		},
		{
			value: 'Action',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Record',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'left',
		},
	];

	const data = [HEADER_ROW];
	const columns = [{ width: 20 }, { width: 30 }, { width: 30 }, { width: 10 }, { width: 40 }];

	const outputFile = file_name;
	const task = new ExportExcelDbLockRulesLogs({
		limit: 500,
		offset: 0,
		filter: filter,
		context,
		client,
		clientJarvis: clientJarvis,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		data,
		stopOnError: true,
		rejectOnError: true,
	});

	try {
		await task.execute();
		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Database Lock Rule Log',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis Export Database Lock Rule Logs',
			is_export_excel: true,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

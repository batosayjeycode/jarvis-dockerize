'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-excel-database-lock-rules' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportExcelDatabaseLockRules extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-excel-database-lock-rules');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryCount);
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
			return Q.all(this.options.client.connectNewDwh.query(query));
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const createdAt = new Date(row.created_at);
					createdAt.setHours(createdAt.getHours() + 7);
					const updateAt = new Date(row.updated_at);
					updateAt.setHours(updateAt.getHours() + 7);

					const data = [
						{
							value: row.id,
							borderColor: '#000000',
							align: 'center',
						},
						{
							value: row.lock_table,
							borderColor: '#000000',
							align: 'left',
						},
						{
							value: row.lock_field,
							borderColor: '#000000',
							align: 'left',
						},
						{
							value: row.lock_period,
							borderColor: '#000000',
							align: 'center',
						},
						{
							value: createdAt,
							borderColor: '#000000',
							type: Date,
							format: 'dd/mmm/yyyy hh:mm:ss',
							align: 'left',
						},
						{
							value: row.created_by_email,
							borderColor: '#000000',
							align: 'left',
						},
						{
							value: updateAt,
							borderColor: '#000000',
							type: Date,
							format: 'dd/mmm/yyyy hh:mm:ss',
							align: 'left',
						},
						{
							value: row.updated_by_email,
							borderColor: '#000000',
							align: 'left',
						},
					];
					self.options.data.push(data);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis excel-database-lock-rules`);

	const outputFile = file_name;
	const HEADER_ROW = [
		{
			value: 'ID',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Table Name',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Lock Date Field',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Lock Rule (Days)',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Created At',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Created By',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Updated At',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
		{
			value: 'Updated By',
			fontWeight: 'bold',
			borderColor: '#000000',
			backgroundColor: '#a6a6a6',
			align: 'center',
		},
	];

	const data = [HEADER_ROW];
	const columns = [
		{ width: 5 },
		{ width: 40 },
		{ width: 15 },
		{ width: 15 },
		{ width: 20 },
		{ width: 30 },
		{ width: 20 },
		{ width: 30 },
	];
	const task = new ExportExcelDatabaseLockRules({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		additionQuery: criteria.additionQuery,
		document,
		context,
		client,
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
			sheet: 'Database Lock Rule',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Jarvis : Export Database Lock Rules',
			is_export_excel: true,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

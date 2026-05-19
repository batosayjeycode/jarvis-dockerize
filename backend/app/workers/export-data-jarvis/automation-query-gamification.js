'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-gamification-csv' });
const workerHelpers = require('../../helpers/workerHelper');
let fieldName = {};

const fieldNameType1 = {
	id: 'id',
	email: 'email',
	username: 'username',
};

const fieldNameType2 = {
	id: 'id',
	email: 'email',
	username: 'username',
	mission_id: 'mission_id',
	title: 'title',
	start_date: 'start_date',
	end_date: 'end_date',
};

const fieldNameType3 = {
	platform_app: 'platform_app',
	totla_user_visit: 'totla_user_visit',
};

const fieldNameType4 = {
	email: 'email',
	username: 'username',
	order_date: 'order_date',
	reference: 'reference',
	total_order_paid: 'total_order_paid',
	order_state: 'order_state',
	voucher_name_applied: 'voucher_name_applied',
};

const fieldNameType5 = {
	email: 'email',
	username: 'username',
	order_date: 'order_date',
	reference: 'reference',
	total_order_paid: 'total_order_paid',
	order_state: 'order_state',
	redeemed_points: 'redeemed_points',
};

const fieldNameType6 = {
	avg_times_user_join: 'avg_times_user_join',
};

const fieldNameType7 = {
	start_date: 'start_date',
	total_join_user: 'total_join_user',
};

const fieldNameType8 = {
	platform_app: 'platform_app',
	total_visit: 'total_visit',
};

class AutomationQueryGamificationCsv extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-gamification-csv');
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
					const data = Object.entries(fieldName).reduce((acc, el) => {
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
	logger.info('Start jarvis export-automation-query-gamification-csv');
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

	if (!document.file_type) {
		document.file_type = 'type_1';
	}

	let fieldNameType8New = {};
	if (document.mission_id && Array.isArray(document.mission_id)) {
		const objMissionId = document.mission_id.reduce((acc, el) => {
			acc[`total_join_daily_check_in_rewards_${el}`] = `total_join_daily_check_in_rewards_${el}`;
			return acc;
		}, {});
		fieldNameType8New = { ...fieldNameType8, ...objMissionId };
	} else {
		fieldNameType8New = {
			...fieldNameType8,
			total_join_daily_check_in_rewards: 'total_join_daily_check_in_rewards',
		};
	}

	switch (document.file_type) {
		case 'type_1':
			fieldName = fieldNameType1;
			break;
		case 'type_2':
			fieldName = fieldNameType2;
			break;
		case 'type_3':
			fieldName = fieldNameType3;
			break;
		case 'type_4':
			fieldName = fieldNameType4;
			break;
		case 'type_5':
			fieldName = fieldNameType5;
			break;
		case 'type_6':
			fieldName = fieldNameType6;
			break;
		case 'type_7':
			fieldName = fieldNameType7;
			break;
		case 'type_8':
			fieldName = fieldNameType8New;
			break;
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AutomationQueryGamificationCsv({
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
			subject: 'Export Automation Query Gamification',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

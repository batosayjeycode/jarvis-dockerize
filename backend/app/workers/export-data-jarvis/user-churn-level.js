/**
 * @author Dikdik Kusdinar
 **/
'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const moment = require('moment');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-automation-query-user-churn-level' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportUserChurnLevel extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-automation-query-user-churn-level');
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
		let dataDWH = [];
		const userChurnHash = {};
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `select * from (${this.options.queryRow}) as sub limit ${limit} offset ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((results) => {
				dataDWH = results.rows;
				const userIds = (dataDWH || []).map((c) => c.id_customer_sociolla);

				const filter = {
					id_customer: { $in: userIds },
					combined_prob_alive_levels: { $in: this.options.document.churn_level },
				};

				return this.options.clientAnalytics
					.db(process.env.MS_ANALYTICS_MONGODB)
					.collection('churn_models')
					.find(filter)
					.toArray();
			})
			.then((results) => {
				const churnMongo = results;

				churnMongo.forEach((cm) => {
					userChurnHash[`${cm.id_customer}`] = cm;
				});

				for (const i in dataDWH) {
					self.options.csv.push({
						'ID customer': dataDWH[i].id_customer,
						Email: dataDWH[i].email,
						'First Name': dataDWH[i].firstname,
						'Last Name': dataDWH[i].lastname,
						'Phone No': dataDWH[i].phone,
						SocoID: dataDWH[i].username,
						'Prob value': userChurnHash[dataDWH[i].id_customer_sociolla]
							? userChurnHash[dataDWH[i].id_customer_sociolla].combined_prob_alive
							: 0,
						'Churn Level': userChurnHash[dataDWH[i].id_customer_sociolla]
							? userChurnHash[dataDWH[i].id_customer_sociolla].combined_prob_alive_levels
							: '',
						'Last Order Date': moment(new Date(dataDWH[i].order_date)).format('YYYY-MM-DD') || null,
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
	const clientAnalytics = message.clientAnalytics;
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || 'user_churn_level';
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis automation-query-user-churn-level`);

	const outputFile = file_name;
	const fields = [
		'ID customer',
		'Email',
		'First Name',
		'Last Name',
		'Phone No',
		'SocoID',
		'Prob value',
		'Churn Level',
		'Last Order Date',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportUserChurnLevel({
		limit: 500,
		offset: 0,
		queryCount: criteria.queryCount,
		queryRow: criteria.queryRow,
		context,
		client,
		clientAnalytics: clientAnalytics,
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
			subject: 'Export User Churn Level',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

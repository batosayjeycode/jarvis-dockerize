'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2b-download-target-sales' });
const workerHelpers = require('../../../../helpers/workerHelper');

class ExportTargetSales extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2b-download-target-sales');
	}
	getTotalCount() {
		return Q.try(() => {
			return this.options.client.connectNewDwh.query(this.options.queryCount);
		})
			.then((result) => {
				logger.info(
					`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].total_rows}`,
				);
				return parseInt(result.rows[0].total_rows);
			})
			.catch((err) => {
				logger.error(err);
				throw err;
			});
	}
	processBatch(limit, offset) {
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} ORDER BY origin_date ASC LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result?.rows || [];

				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, [fieldKey, fieldName]) => {
						acc[fieldKey] = row[fieldName];
						return acc;
					}, {});

					this.options.csv.push(data);
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
	const isValidEmail = workerHelpers.checkValidEmail(context?.user?.email);
	if (!isValidEmail) {
		logger.error(`[${context?.user?.name} - ${context?.user?.email}] Email is not valid!`);
		return;
	}
	const client = message.client;
	const clientJarvis = message.clientJarvis;
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	const file_name = message.data.file_name || null;
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} b2b-download-target-sales`);

	const outputFile = file_name;
	const fieldName = {
		target_type: 'target_type',
		period_type: 'period_type',
		target_period: 'target_period',
		business_unit: 'business_unit',
		...(document?.groups.includes('channel') ? { partner_channel: 'partner_channel' } : {}),
		...(document?.groups.includes('sales_team') ? { sales_team: 'sales_team' } : {}),
		...(document?.groups.includes('brand') ? { brand: 'brand' } : {}),
		target_value_nmv_before_discount: 'target_value_nmv_before_discount',
		target_value_nmv_before_discount_internal: 'target_value_nmv_before_discount_internal',
		target_value_nmv_before_discount_external: 'target_value_nmv_before_discount_external',
		target_value_nmv_after_discount: 'target_value_nmv_after_discount',
		target_value_nmv_after_discount_internal: 'target_value_nmv_after_discount_internal',
		target_value_nmv_after_discount_external: 'target_value_nmv_after_discount_external',
		target_value_net_revenue: 'target_value_net_revenue',
		target_value_net_revenue_internal: 'target_value_net_revenue_internal',
		target_value_net_revenue_external: 'target_value_net_revenue_external',
		// sales_team_source: 'sales_team_source',
	};

	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportTargetSales({
		limit: 1000,
		offset: 0,
		queryRow: criteria.queryRow,
		queryCount: criteria.queryCount,
		context,
		client,
		email: criteria.send_to_email,
		filename: criteria.filename,
		file_name,
		csv: input,
		document,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
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
			subject: 'Upload Target Template',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

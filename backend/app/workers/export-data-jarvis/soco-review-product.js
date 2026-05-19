'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-soco-review-product' });
const workerHelpers = require('../../helpers/workerHelper');
const CommonHelper = require('../../helpers/commonHelper');

class ExportSocoReviewProduct extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-soco-review-product');
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
					self.options.csv.push({
						id_customer: row.id_customer,
						email: row.email,
						skin_type: row.skin_type,
						customer_level: row.customer_level,
						average_rating: row.average_rating,
						review: row.review,
						star_durability: row.star_durability,
						star_effectiveness: row.star_effectiveness,
						star_eficiency: row.star_eficiency,
						star_long_wear: row.star_long_wear,
						star_packaging: row.star_packaging,
						star_pigmentation: row.star_pigmentation,
						star_scent: row.star_scent,
						star_texture: row.star_texture,
						star_value_for_money: row.star_value_for_money,
						is_repurchase: row.is_repurchase,
						is_recommended: row.is_recommended,
						is_verified_purchase: row.is_verified_purchase,
						review_date: row.review_date,
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
	const clientJarvis = message.clientJarvis;
	const file_name = message.data.file_name || null;
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-soco-review-product`);

	const outputFile = file_name;
	const fields = [
		'id_customer',
		'email',
		'skin_type',
		'customer_level',
		'average_rating',
		'review',
		'star_durability',
		'star_effectiveness',
		'star_eficiency',
		'star_long_wear',
		'star_packaging',
		'star_pigmentation',
		'star_scent',
		'star_texture',
		'star_value_for_money',
		'is_repurchase',
		'is_recommended',
		'is_verified_purchase',
		'review_date',
	];
	const isShowEmailCustomer = CommonHelper.hasAccess(context, 'soco.review', 'show-email-customer');
	if (!isShowEmailCustomer) {
		fields.splice(1, 1);
	}
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSocoReviewProduct({
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
			subject: 'Export Soco Review Product',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

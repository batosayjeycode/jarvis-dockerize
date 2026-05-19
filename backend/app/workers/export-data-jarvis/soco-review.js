'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-soco-review' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportSocoReview extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-soco-review');
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
					const data = Object.entries(this.options.fields).reduce((acc, el) => {
						if (el[1] === 'category_tree') {
							row[el[1]] =
								`${row['category_grandchild']}->${row['category_child']}->${row['category_parent']}`;
						}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-soco-review`);

	let fields = {};

	if (document.group_by === 'by_product') {
		fields = {
			'Id Product': 'id_product',
			Reference: 'reference',
			'Product Name': 'product_name',
			Brand: 'brand',
			'Category Default': 'category_default',
			'Category Tree': 'category_tree',
		};
	} else if (document.group_by === 'by_brand') {
		fields = {
			Brand: 'brand',
		};
	} else if (document.group_by === 'by_default_category') {
		fields = {
			'Category Default': 'category_default',
		};
	} else if (document.group_by === 'by_deepest_category') {
		fields = {
			'Category Parent': 'category_parent',
			'Category Child': 'category_child',
			'Category Grandchild': 'category_grandchild',
			'Category Tree': 'category_tree',
		};
	}

	const outputFile = file_name;
	const defaultFields = {
		'Avg. Rating': 'rating',
		'All Review': 'total_review',
		'Expert Review': 'expert_review',
		'Shopper Review': 'verified_purchase_count',
		'Sold In Sociolla': 'is_active_in_sociolla',
		'Repurchase Yes': 'repurchase_yes',
		'Repurchase No': 'repurchase_no',
		'Repurchase Maybe': 'repurchase_maybe',
		'Recommended Count': 'recommended_count',
		'Repurchase Yes (%)': 'percentage_repurchase_yes',
		'Recommended Yes (%)': 'percentage_recommended',
		is_active_in_sociolla: 'is_active_in_sociolla',
		star_durability: 'star_durability',
		star_effectiveness: 'star_effectiveness',
		star_eficiency: 'star_eficiency',
		star_long_wear: 'star_long_wear',
		star_packaging: 'star_packaging',
		star_pigmentation: 'star_pigmentation',
		star_scent: 'star_scent',
		star_texture: 'star_texture',
		star_value_for_money: 'star_value_for_money',
		'Date Add': 'product_dateadd',
	};
	fields = { ...fields, ...defaultFields };

	const fieldHeader = Object.values(fields);
	const json2csv = new Transform({ fieldHeader }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSocoReview({
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
		fields,
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
			subject: 'Export Soco Review',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

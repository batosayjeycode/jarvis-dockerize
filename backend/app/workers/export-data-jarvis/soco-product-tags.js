'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-soco-product' });
const workerHelpers = require('../../helpers/workerHelper');

class ExportSocoProductTags extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-soco-product');
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
						id: row.id,
						reference: row.reference,
						ean13: row.ean13,
						product_name: row.product_name,
						product_attribute: row.product_attribute,
						brand: row.brand,
						product_classification: row.product_classification,
						sellable_in_sociolla: row.sellable_in_sociolla,
						sellable_in_lilla: row.sellable_in_lilla,
						sellable_in_offline_store: row.sellable_in_offline_store,
						sellable_in_sociolla_vn: row.sellable_in_sociolla_vn,
						total_review: row.total_review,
						registered_date: row.registered_date,
						category_default: row.category_default,
						tree_categories: row.tree_categories,
						level_1_category: row.level_1_category,
						level_1A_subcategory: row.level_1A_subcategory,
						level_2_product_origins: row.level_2_product_origins,
						level_2a_product_country_origins: row.level_2a_product_country_origins,
						level_3_type: row.level_3_type,
						level_3a_subtype: row.level_3a_subtype,
						level_4_format: row.level_4_format,
						level_4a_format_ii: row.level_4a_format_ii,
						level_5_colors: row.level_5_colors,
						level_6_finish: row.level_6_finish,
						level_7_improvement_focus: row.level_7_improvement_focus,
						level_7a_benefit: row.level_7a_benefit,
						skin_hair_type: row.skin_hair_type,
						my_interest: row.my_interest,
						skin_tone: row.skin_tone,
						skin_undertone: row.skin_undertone,
						concern: row.concern,
						scent: row.scent,
						special_needs: row.special_needs,
						active_ingredients: row.active_ingredients,
						ingredients_ii: row.ingredients_ii,
						ingredients_iii: row.ingredients_iii,
						motherhood_stage: row.motherhood_stage,
						child_age: row.child_age,
						user: row.user,
						girls: row.girls,
						boys: row.boys,
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis export-soco-product`);

	const outputFile = file_name;
	const fields = [
		'id',
		'reference',
		'ean13',
		'product_name',
		'product_attribute',
		'brand',
		'product_classification',
		'sellable_in_sociolla',
		'sellable_in_lilla',
		'sellable_in_offline_store',
		'sellable_in_sociolla_vn',
		'total_review',
		'registered_date',
		'category_default',
		'tree_categories',
		'level_1_category',
		'level_1A_subcategory',
		'level_2_product_origins',
		'level_2a_product_country_origins',
		'level_3_type',
		'level_3a_subtype',
		'level_4_format',
		'level_4a_format_ii',
		'level_5_colors',
		'level_6_finish',
		'level_7_improvement_focus',
		'level_7a_benefit',
		'skin_hair_type',
		'my_interest',
		'skin_tone',
		'skin_undertone',
		'concern',
		'scent',
		'special_needs',
		'active_ingredients',
		'ingredients_ii',
		'ingredients_iii',
		'motherhood_stage',
		'child_age',
		'user',
		'girls',
		'boys',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportSocoProductTags({
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
			subject: 'Export Soco Product Tag List',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

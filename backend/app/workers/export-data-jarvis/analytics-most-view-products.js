/**
 * EXPORT CSV get most viewed products from Google Analytics
 * apps uniqueScreenName
 * web uniquePageViews
 */
'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const { google } = require('googleapis');
const scopes = 'https://www.googleapis.com/auth/analytics.readonly';
const jwt = new google.auth.JWT(process.env.GA_CLIENT_EMAIL, null, process.env.GA_PRIVATE_KEY, scopes);
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'analytics-most-view-products' });
const workerHelpers = require('../../helpers/workerHelper');

class AnalyticsMostViewProducts extends AbstractBatchTask {
	constructor(options) {
		super(options, 'analytics-most-view-products');
	}
	getTotalCount() {
		logger.info(`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: 2000`);
		return Q.resolve(2000);
	}
	processBatch(limit, offset) {
		const self = this;
		const product_hash = {};
		let data_ga = [];
		const document = this.options.document;

		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			return google.analytics('v3').data.ga.get({
				auth: jwt,
				ids: document.view_id,
				'start-date': document.start_date,
				'end-date': document.end_date,
				dimensions: document.dimensions, //only 7 dimensions allowed
				sort: document.sort,
				metrics: document.metrics,
				filters: document.filters,
				'max-results': document.limit,
				'start-index': document.page,
			});
		})
			.then((result) => {
				data_ga = result.data.rows || [];
				const query =
					"SELECT id_product, reference, ean13, product_name, brand, url_sociolla FROM dwh_revamp.dim_product WHERE product_level = 'has-combination' AND brand IS NOT NULL";

				return this.options.client.connectDwh.query(query);
			})
			.then((result_dwh) => {
				const products = result_dwh.rows || [];
				products.forEach((p) => {
					if (p.url_sociolla) {
						const new_url =
							document.tabs === 'web'
								? '/' + p.url_sociolla.split('/')[4]
								: `pd-${p.brand.toLowerCase()}-${p.product_name.toLowerCase()}`;
						product_hash[new_url] = p;
					}
				});

				for (const row of data_ga) {
					const p = product_hash[row[0].toLowerCase()];
					const data = {
						Brand: p?.brand,
						'ID Product': p?.id_product,
						'SKU name': p?.product_name,
						Path: row[0],
						Pageview: row[1],
					};
					if ((document.tabs === 'web' && p) || document.tabs !== 'web') {
						self.options.csv.push(data);
					}
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis analytics-most-view-products`);

	const outputFile = file_name;
	const fields = ['Brand', 'ID Product', 'SKU name', 'Path', 'Pageview'];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new AnalyticsMostViewProducts({
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
			subject: 'Export Most View Products',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

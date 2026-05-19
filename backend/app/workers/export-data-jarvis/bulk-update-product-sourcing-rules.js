'use strict';

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-bulk-update-product-sourcing-rules' });
const S3 = require('sociolla-core/lib/aws/s3');
const readXlsxFile = require('read-excel-file/node');
const Queries = require('../../queries/inventory-management/product-sourcing-rules');
const ProductQueries = require('../../queries/v2/products');
const BrandQueries = require('../../queries/v2/brands');
const workerHelpers = require('../../helpers/workerHelper');

class BulkUpdateProductSourcingRules extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-bulk-update-product-sourcing-rules');
	}
	getTotalCount() {
		logger.info(
			`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this.options.queryCount}`,
		);
		return Promise.resolve(this.options.queryCount);
	}
	processBatch(limit, offset) {
		const data = [];
		const hashMap = {};
		const mapping = {
			product: 'Product Variant',
			brand: 'Brand',
		};
		for (let i = offset; i < limit + offset; i++) {
			data.push(this.options.data[i]);
		}

		const ids = data.map((row) => parseInt(row.id));

		return Promise.resolve(this.options.client.connectNewDwh.query(Queries.get({ ids })))
			.then((existingData) => {
				(existingData?.rows || []).forEach((row) => (hashMap[row?.id] = row));
				return Promise.resolve(
					this.options.client.connectNewDwh.query(Queries.bulkUpdate(this.options.context, data)),
				);
			})
			.then((result) => {
				const datalogs = (result?.rows || []).map((row) => {
					const old_data = hashMap[row?.id];
					return {
						insertOne: {
							document: {
								user: {
									id: this.options.context.user._id,
									name: this.options.context.user.name,
									email: this.options.context.user.email,
								},
								user_role: {
									id: this.options.context.session.role_id,
									name: this.options.context.session.role_name,
								},
								action: 'bulk-update',
								fileurl: 'https://' + process.env.CDN_ALIAS + '/' + this.options.document.filename,
								data: {
									id: old_data?.id,
									data_type: `${mapping[old_data?.data_type]} --> ${mapping[row?.data_type]}`,
									name: `${old_data?.name} --> ${row?.name}`,
									source_id: `${old_data?.source_id} --> ${row?.source_id}`,
									source_vn: `${old_data?.source_vn} --> ${row?.source_vn}`,
								},
								created_at: new Date(),
								updated_at: new Date(),
							},
						},
					};
				});

				return this.options.clientJarvis
					.db(process.env.JARVIS_MONGODB)
					.collection('product_sourcing_rules_logs')
					.bulkWrite(datalogs);
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
	const document = (criteria.document && JSON.parse(criteria.document)) || {};
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis bulk-update-product-sourcing-rules`);
	const filename = document.filename || null;
	const bucket = process.env.S3_UPLOADS_BUCKET;

	const resultS3 = await S3.download({ key: filename, bucket: bucket });
	await fs.writeFileSync(filename, resultS3);
	const data = await readXlsxFile(filename);
	const dataHash = {};
	const products = [];
	const brands = [];
	const dataFound = [];

	data.shift();
	data.forEach((r) => {
		dataHash[r[2].toLowerCase()] = {
			ID: r[0],
			'Data Type': r[1],
			Name: r[2],
			'Cerebro Indo Company ID': r[3],
			'Cerebro VN Company ID': r[4],
		};
		if (r[1].toLowerCase() === 'brand') {
			brands.push(r[2].toLowerCase());
		} else {
			products.push(r[2].toLowerCase());
		}
	});

	const productQ = ProductQueries.get({ keywords: products, limit: products.length, is_multiple: true });
	const brandQ = BrandQueries.get({ keywords: brands, limit: brands.length, is_multiple: true });

	const productResult = products?.length ? await client.connectNewDwh.query(productQ) : await Promise.resolve([]);
	const brandResult = brands?.length ? await client.connectNewDwh.query(brandQ) : await Promise.resolve([]);

	(productResult?.rows || []).forEach((p) => {
		if (dataHash[p?.reference.toLowerCase()]) {
			dataFound.push({
				id: parseInt(dataHash[p?.reference.toLowerCase()]['ID']),
				data_type: 'product',
				name: p?.reference,
				sociolla_id: p?.id_product_attribute,
				odoo_id: p?.id_product_odoo || 0,
				source_id: parseInt(dataHash[p?.reference.toLowerCase()]['Cerebro Indo Company ID']),
				source_vn: parseInt(dataHash[p?.reference.toLowerCase()]['Cerebro VN Company ID']),
			});
		}
	});
	(brandResult?.rows || []).forEach((p) => {
		if (dataHash[p?.brand.toLowerCase()]) {
			dataFound.push({
				id: parseInt(dataHash[p?.brand.toLowerCase()]['ID']),
				data_type: 'brand',
				name: p?.brand,
				sociolla_id: p?.id_brand,
				odoo_id: p?.id_odoo || 0,
				source_id: parseInt(dataHash[p?.brand.toLowerCase()]['Cerebro Indo Company ID']),
				source_vn: parseInt(dataHash[p?.brand.toLowerCase()]['Cerebro VN Company ID']),
			});
		}
	});

	const task = new BulkUpdateProductSourcingRules({
		limit: 25,
		offset: 0,
		queryCount: dataFound?.length,
		document,
		context,
		client,
		clientJarvis,
		stopOnError: true,
		rejectOnError: true,
		data: dataFound,
	});

	try {
		await task.execute();
	} catch (error) {
		logger.error(error);
		throw error;
	}
};

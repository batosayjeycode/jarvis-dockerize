'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({
	worker: 'omnichannel-top-stores-all-order-with-item',
});
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

class OmnichannelTopStoresAllOrderWithItem extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-omnichannel-top-stores-all-order-with-item');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return this.options.client.connectNewDwh.query(this.options.queryCount);
			}
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
			if (this.options.document.isV2) {
				return this.options.client.connectNewDwh.query(query);
			}
			return this.options.client.connectDwh.query(query);
		})
			.then((result) => {
				const rows = result.rows || [];
				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).reduce((acc, el) => {
						if (
							[
								'order_date_ori',
								'shipped_date_ori',
								'delivered_date_ori',
								'order_date',
								'shipped_at',
								'delivered_at',
							].includes(el[1])
						) {
							acc[el[0]] = row[el[1]] ? moment(new Date(row[el[1]])).format('YYYY-MM-DD HH:mm:ss') : '';
						} else {
							acc[el[0]] = row[el[1]] || null;
						}
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
	const isV2 = document?.isV2 ? 'V2' : '';
	logger.info(
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} omnichannel-top-stores-all-order-with-item`,
	);

	let fieldName = {
		'Type Order': 'type_order',
		'Order Date': 'order_date_ori',
		'Order ID': 'id_order',
		Reference: 'reference',
		Payment: 'order_payment',
		Platform: 'order_platform',
		Email: 'email',
		Customer: 'customer',
		'Delivery Province': 'delivery_province',
		'Delivery City': 'delivery_city',
		'Delivery District': 'delivery_district',
		'Delivery Postal Code': 'delivery_postal_code',
		'Customer Province': 'customer_province',
		'Customer City': 'customer_city',
		'Customer District': 'customer_district',
		Status: 'order_state',
		'Is Manual Order': 'is_manual_order',
		Cashier: 'offlinestore_cashier',
		'Store Name': 'offlinestore_store_name',
		'Offlinestore BA Code': 'offlinestore_ba_code',
		'Is Offline Guest': 'is_offlinestore_guest',
		'Invoice Code': 'invoice_code',
		'Total Paid': 'total_order_paid',
		'Total Shipping': 'total_order_shipping',
		'Total Voucher Amount': 'total_order_voucher',
		'ID Product': 'id_product',
		'ID Product Attr': 'id_product_attribute',
		'Product Name': 'product_name',
		'Product Attr': 'product_attribute',
		brand: 'brand',
		'Product Classification': 'product_classification',
		'Category Default': 'category_default',
		'Product Type': 'product_type',
		QTY: 'qty',
		'Value Original': 'value_original',
		Value: 'value',
		'Voucher Prorate': 'voucher_prorate',
		'Shipped Date Ori': 'shipped_date_ori',
		'Delivered Date': 'delivered_date_ori',
		'Customer Unique ID': 'customer_unique_id',
		'EDC Type': 'edc_type',
		'Voucher Name Applied': 'voucher_name_applied',
		Sales: 'sales_value',
		'Product Deduction for Sociolla': 'product_deduction_for_sociolla',
		'Product Deduction for Brand': 'product_deduction_for_brand',
		'ID Product Discount': 'id_product_discount',
		'Refunded Amount': 'refunded_amount',
		'Refunded Quantity': 'refunded_quantity',
		'ID Order Item': 'id_order_item',
		'Offline Store': 'offline_store',
	};

	if (isV2) {
		fieldName = {
			'Type Order': 'type_order',
			'Order Date': 'order_date',
			'Order ID': 'id_order',
			Reference: 'order_reference',
			Payment: 'payment',
			Platform: 'platform',
			Email: 'email',
			Customer: 'fullname',
			'Delivery Province': 'delivery_province',
			'Delivery City': 'delivery_city',
			'Delivery District': 'delivery_district',
			'Delivery Postal Code': 'delivery_postal_code',
			'Customer Province': 'customer_province',
			'Customer City': 'customer_city',
			'Customer District': 'customer_district',
			Status: 'order_status',
			'Is Manual Order': 'is_manual_order',
			Cashier: 'cashier_name',
			'Store Name': 'store_name',
			'Offlinestore BA Code': 'offlinestore_ba_code',
			'Is Offline Guest': 'is_guest',
			'Invoice Code': 'invoice_code',
			'Total Paid': 'total_paid',
			'Total Shipping': 'total_shipping',
			'Total Voucher Amount': 'voucher_amount',
			'ID Product': 'id_product',
			'ID Product Attr': 'combination_id',
			'Product Name': 'product_name',
			'Product Attr': 'product_combination',
			brand: 'brand',
			'Product Classification': 'product_classification',
			'Category Default': 'default_category_name',
			'Product Type': 'order_product_type',
			QTY: 'quantity',
			'Value Original': 'value_original',
			Value: 'value',
			'Voucher Prorate': 'voucher_prorate',
			'Shipped Date Ori': 'shipped_at',
			'Delivered Date': 'delivered_at',
			'Customer Unique ID': 'user_id',
			'EDC Type': 'edc_type',
			'Voucher Name Applied': 'voucher_applied_name',
			Sales: 'sales',
			'Product Deduction for Sociolla': 'deduction_for_sociolla',
			'Product Deduction for Brand': 'deduction_for_brand',
			'ID Product Discount': 'id_product_discount',
			'Refunded Amount': 'refunded_amount',
			'Refunded Quantity': 'refunded_quantity',
			'ID Order Item': 'id_order_item',
			'Offline Store': 'store',
		};
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new OmnichannelTopStoresAllOrderWithItem({
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
		fieldName,
		document,
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
			subject: `Export ${isV2} Omnichannel Top Stores All Order With Item`,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'omnichannel-top-stores-all-order' });
const moment = require('moment');
const workerHelpers = require('../../helpers/workerHelper');

class OmnichannelTopStoresAllOrder extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-omnichannel-top-stores-all-order');
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
								'birthday',
								'delivered_date_ori',
								'order_date',
								'shipped_date_ori',
								'birthday_date',
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
		`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} omnichannel-top-stores-all-order`,
	);

	let fieldName = {
		'Type Order': 'type_order',
		'Order Date': 'order_date_ori',
		'Order ID': 'id_order',
		Reference: 'reference',
		Payment: 'order_payment',
		Platform: 'order_platform',
		'Order Type': 'order_type',
		Email: 'email',
		Username: 'username',
		Birthday: 'birthday',
		Customer: 'customer',
		'Customer Unique ID': 'customer_unique_id',
		'Invoice Code': 'invoice_code',
		phone: 'phone',
		'Delivery Province': 'delivery_province',
		'Delivery City': 'delivery_city',
		'Delivery District': 'delivery_district',
		'Delivery Postal Code': 'delivery_postal_code',
		'Customer Province': 'customer_province',
		'Customer City': 'customer_city',
		'Customer District': 'customer_district',
		Status: 'order_state',
		'Shipped Date Ori': 'shipped_date_ori',
		'Delivered Date': 'delivered_date_ori',
		'Is Manual Order': 'is_manual_order',
		'Store Alias': 'offlinestore_store_alias',
		'Store Name': 'offlinestore_store_name',
		Cashier: 'offlinestore_cashier',
		offlinestore_bt_assistant: 'offlinestore_bt_assistant',
		offlinestore_ba_code: 'offlinestore_ba_code',
		'Company Group': 'sociolla_company_group',
		'Sociolla is Gross': 'sociolla_is_gross',
		'Sociolla is Valid': 'sociolla_is_valid',
		'Sociolla is Net': 'sociolla_is_net',
		'Sociolla is Reserved': 'sociolla_is_reserved',
		'Total Paid': 'total_order_paid',
		'Total Shipping': 'total_order_shipping',
		'Total Voucher Amount': 'total_order_voucher',
		'Is Offline Guest': 'is_offlinestore_guest',
		'Voucher Name Applied': 'voucher_name_applied',
		'Price Rule Name': 'price_rule_name',
		'Original Order ID': 'original_order_id',
		'EDC Type': 'edc_type',
		'BA code': 'offlinestore_ba_code',
		'Bill No': 'ref_bill_number',
		Reason: 'reason',
		'Redeemed Point': 'soco_point_redeemed',
		Carrier: 'carrier',
		Sales: 'sales_value',
		'Total Product Discount': 'total_product_discount',
		'Refunded Amount': 'total_refunded_amount',
		'Refunded Quantity': 'total_refunded_qty',
		Notes: 'order_notes',
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
			'Order Type': 'order_type',
			Email: 'email',
			Username: 'user_name',
			Birthday: 'birthday_date',
			Customer: 'fullname',
			'Customer Unique ID': 'user_id',
			'Invoice Code': 'invoice_code',
			phone: 'phone_no',
			'Delivery Province': 'delivery_province',
			'Delivery City': 'delivery_city',
			'Delivery District': 'delivery_district',
			'Delivery Postal Code': 'delivery_postal_code',
			'Customer Province': 'customer_province',
			'Customer City': 'customer_city',
			'Customer District': 'customer_district',
			Status: 'order_status',
			'Shipped Date Ori': 'shipped_date_ori',
			'Delivered Date': 'delivered_date_ori',
			'Is Manual Order': 'is_manual_order',
			'Store Alias': 'store_alias',
			'Store Name': 'store_name',
			Cashier: 'cashier_name',
			offlinestore_bt_assistant: 'offlinestore_bt_assistant',
			offlinestore_ba_code: 'offlinestore_ba_code',
			'Company Group': 'sociolla_company_group',
			'Sociolla is Gross': 'sociolla_is_gross',
			'Sociolla is Valid': 'sociolla_is_valid',
			'Sociolla is Net': 'sociolla_is_net',
			'Sociolla is Reserved': 'sociolla_is_reserved',
			'Total Paid': 'total_paid',
			'Total Shipping': 'total_shipping',
			'Total Voucher Amount': 'voucher_amount',
			'Is Offline Guest': 'is_guest',
			'Voucher Name Applied': 'voucher_applied_name',
			'Price Rule Name': 'price_rule_name',
			'Original Order ID': 'related_order_references_id',
			'EDC Type': 'edc_type',
			'BA code': 'offlinestore_ba_code',
			'Bill No': 'ref_bill_number',
			Reason: 'cancellation_reason',
			'Redeemed Point': 'total_redeem_point',
			Carrier: 'carrier',
			Sales: 'sales',
			'Total Product Discount': 'total_product_discount',
			'Refunded Amount': 'total_refund_amount',
			'Refunded Quantity': 'total_refund_quantity',
			Notes: 'notes',
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
	const task = new OmnichannelTopStoresAllOrder({
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
			subject: `Export ${isV2} Omnichannel Top Stores All Order`,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

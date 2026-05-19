'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const { Readable } = require('stream');
const moment = require('moment');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-omnichannel-all-order' });
const workerHelpers = require('../../helpers/workerHelper');

class OmnichannelAllOrder extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-omnichannel-all-order');
	}
	getTotalCount() {
		return Q.try(() => {
			if (this.options.document.isV2) {
				return this.options.client.connectNewDwh.query(this.options.queryCount);
			}
			return this.options.client.connectDwh.query(this.options.queryCount);
		}).then((result) => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${result.rows[0].count}`,
			);
			return parseInt(result.rows[0].count);
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
								'delivered_date',
								'order_date',
								'shipped_date',
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis ${isV2} omnichannel-all-order`);

	let fieldName = {
		'Customer Unique Id': 'customer_unique_id',
		// 'Order Date': 'order_date',
		'Order Date': 'order_date_ori',
		'Order ID': 'id_order',
		Reference: 'reference',
		'Voucher Code': 'voucher_name_applied',
		Payment: 'order_payment',
		Province: 'delivery_province',
		City: 'delivery_city',
		'Total Paid': 'total_order_paid',
		'Before Discount': 'before_discount',
		'Total Voucher Amount': 'total_order_voucher',
		'Total Shipping': 'total_order_shipping',
		Status: 'order_state',
		'Is Manual Order': 'is_manual_order',
		Cashier: 'offlinestore_cashier',
		Platform: 'order_platform',
		'Store Name': 'offlinestore_store_name',
		'Shipped Date Ori': 'shipped_date_ori',
		'Delivered Date': 'delivered_date',
		'BA code': 'offlinestore_ba_code',
		'Bill No': 'ref_bill_number',
		'Is Offline Guest': 'is_offlinestore_guest',
		'Refunded Amount': 'total_refunded_amount',
		'Refunded Quantity': 'total_refunded_qty',
		Reason: 'reason',
		Notes: 'order_notes',
		'Order Type': 'order_type',
		Carrier: 'carrier',
		'Redeemed Point': 'soco_point_redeemed',
		'Original Order ID': 'original_order_id',
		'EDC Type': 'edc_type',
	};

	if (isV2) {
		fieldName = {
			'Customer Unique Id': 'customer_unique_id',
			'Order Date': 'order_date',
			'Order ID': 'id_order',
			Reference: 'order_reference',
			'Voucher Code': 'voucher_code',
			Payment: 'payment_name',
			Province: 'province',
			City: 'city',
			'Total Paid': 'total_paid',
			'Before Discount': 'before_dicount',
			'Total Voucher Amount': 'voucher_amount',
			'Total Shipping': 'total_shipping',
			Status: 'status',
			'Is Manual Order': 'is_manual_order',
			Cashier: 'cashier_name',
			Platform: 'order_source',
			'Store Name': 'store',
			'Shipped Date Ori': 'shipped_date',
			'Delivered Date': 'delivered_date',
			'BA code': 'offlinestore_ba_code',
			'Bill No': 'invoice_code',
			'Is Offline Guest': 'is_offline_guest',
			'Refunded Amount': 'refund_amount',
			'Refunded Quantity': 'total_refund_quantity',
			Reason: 'cancellation_reason',
			Notes: 'notes',
			'Order Type': 'order_type',
			Carrier: 'carrier',
			'Redeemed Point': 'total_redeem_point',
			'Original Order ID': 'related_order_references_code',
			'EDC Type': 'edc_type',
		};
	}

	const outputFile = file_name;
	const fields = Object.keys(fieldName);
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new OmnichannelAllOrder({
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
			subject: `Export ${isV2} Omnichannel All Order`,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

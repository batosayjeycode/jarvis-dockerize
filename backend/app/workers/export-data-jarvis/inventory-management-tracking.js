'use strict';

const Q = require('q');

const { Transform } = require('json2csv');
const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'inventory-management-tracking' });
const { Readable } = require('stream');
const workerHelpers = require('../../helpers/workerHelper');

class ExportInventoryManagementTracking extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-inventory-management-tracking');
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
		let deliveryTrackingData;
		const historyHash = {};
		return Q.try(() => {
			logger.info(
				`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Start Query picked: ${limit}, processed: ${offset}`,
			);
			const query = `${this.options.queryRow} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectDwh.query(query);
		})
			.then((results) => {
				const orderIds = [];
				deliveryTrackingData = results.rows;
				(deliveryTrackingData || []).forEach((dtd) => {
					orderIds.push(dtd.id_order);
				});
				return orderIds;
			})
			.then((orderId) => {
				orderId = orderId.map((ids) => `'${ids}'`).join();
				const queryHistory = `select
							roth."_id_order",
							ros.order_state,
							COALESCE(roth.state_changed_at,fo.order_date_ori) as state_changed_at
						from dwh_revamp.fact_order fo
						join stg.revamp_order_trx_history roth on fo.id_order = roth."_id_order"
						join stg.revamp_order_state ros on roth."_to_id_state" = ros._id
						where roth."_to_id_state" in ('5e4ff829b421f336a2168b99','5e4ff829b421f336a2168bcf')
						and roth."_id_order" in (${orderId})
						group by roth."_id_order",
							ros.order_state,roth.state_changed_at,fo.order_date_ori`;
				return this.options.client.connectDwh.query(queryHistory);
			})
			.then((resultsHistory) => {
				(resultsHistory.rows || []).forEach((rh) => {
					historyHash[`${rh._id_order}_${rh.order_state}`] = rh.state_changed_at;
				});

				for (const val of deliveryTrackingData) {
					self.options.csv.push({
						'Order Date': val.order_date,
						'Payment Accepted Date': historyHash[`${val.id_order}_Payment accepted`],
						'Packed Date': historyHash[`${val.id_order}_Packed`],
						'Shipped Date': val.shipped_date,
						'Delivery Date': val.delivered_date,
						'Order ID': val.id_order,
						Reference: val.reference,
						Carrier: val.carrier_name,
						Destination: `${val.district} / ${val.city_type} ${val.city} / ${val.province}`,
						'Shipping Cost': val.total_order_shipping,
						'Est Shipping Fee': val.est_shipping_fee,
						State: val.order_state,
						'Order Platform': val.order_platform,
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
	logger.info('Start jarvis inventory-management-tracking');
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

	const outputFile = file_name;
	const fields = [
		'Order Date',
		'Payment Accepted Date',
		'Packed Date',
		'Shipped Date',
		'Delivery Date',
		'Order ID',
		'Reference',
		'Carrier',
		'Destination',
		'Shipping Cost',
		'Est Shipping Fee',
		'State',
		'Order Platform',
	];
	const json2csv = new Transform({ fields }, { objectMode: true });
	const output = fs.createWriteStream(outputFile, { flags: 'a' });
	const input = new Readable({ objectMode: true });
	input._read = () => {};
	input.pipe(json2csv).pipe(output);
	const task = new ExportInventoryManagementTracking({
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
			subject: 'Jarvis : Export Inventory Management Tracking',
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

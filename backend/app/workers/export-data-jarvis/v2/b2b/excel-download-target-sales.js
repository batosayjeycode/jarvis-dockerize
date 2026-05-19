'use strict';

const Q = require('q');

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const writeXlsxFile = require('write-excel-file/node');
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
			// Replace 'channel' with 'partner_channel' in the array
			const default_groupby = ['target_type', 'origin_date', 'business_unit'];
			const order_groups =
				this?.options?.document?.groups?.map((g) => (g === 'channel' ? 'partner_channel' : g)) ?? [];
			const order_by = [...default_groupby, ...order_groups]?.join(' ASC, ');
			const order_by_type = 'ASC';
			const query = `${this.options.queryRow} ORDER BY ${order_by} ${order_by_type} LIMIT ${limit} OFFSET ${offset}`;
			return this.options.client.connectNewDwh.query(query);
		})
			.then((result) => {
				const rows = result?.rows || [];

				for (const row of rows) {
					const data = Object.entries(this.options.fieldName).map(([_, val]) => {
						const obj = {
							value: row[val],
							borderColor: '#000000',
						};

						return obj;
					});
					this.options.data.push(data);
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

	// Static fields (order preserved)
	const staticFields = {
		target_type: 'target_type',
		period_type: 'period_type',
		target_period: 'target_period',
		business_unit: 'business_unit',
	};

	// Dynamic group fields to sort
	const groupFieldsMap = {
		channel: { partner_channel: 'partner_channel' },
		sales_team: { sales_team: 'sales_team' },
		brand: { brand: 'brand' },
	};

	// Sort group keys by the order in document.groups
	const sortedGroupFields = (document?.groups || [])
		.filter((group) => groupFieldsMap[group]) // keep only known groups
		.map((group) => groupFieldsMap[group]) // map to field objects
		.reduce((acc, obj) => ({ ...acc, ...obj }), {}); // merge objects in order

	// Static fields after group fields
	const trailingFields = {
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

	// Final fieldName in proper order
	const fieldName = {
		...staticFields,
		...sortedGroupFields,
		...trailingFields,
	};

	const keys = Object.keys(fieldName);
	const HEADER_ROW = keys.map((key) => ({
		value: key,
		fontWeight: 'bold',
		borderColor: '#000000',
		backgroundColor: '#a6a6a6',
		align: 'left',
	}));
	const columns = keys.map(() => ({ width: 20 }));
	const data = [HEADER_ROW];
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
		data,
		document,
		stopOnError: true,
		rejectOnError: true,
		fieldName,
	});

	try {
		await task.execute();
		await writeXlsxFile(data, {
			columns,
			filePath: outputFile,
			sheet: 'Upload Target',
		});
		await workerHelpers.sendmail({
			logger,
			context,
			outputFile,
			fs,
			clientJarvis,
			criteria,
			subject: 'Upload Target Template',
			is_export_excel: true,
		});
	} catch (error) {
		fs.rmSync(outputFile, { force: true });
		logger.error(error);
		throw error;
	}
};

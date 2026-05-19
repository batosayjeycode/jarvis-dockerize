'use strict';

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-b2b-upload-target-sales' });
const S3 = require('sociolla-core/lib/aws/s3');
const readXlsxFile = require('read-excel-file/node');
const workerHelpers = require('../../../../helpers/workerHelper');
const TABLE = 'stg.target';
const CommonHelper = require('../../../../helpers/commonHelper');
const { ObjectId } = require('mongodb');

class ImportTargetSales extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-b2b-upload-target-sales');
	}
	getTotalCount() {
		logger.info(
			`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this.options.queryCount}`,
		);
		return Promise.resolve(this.options.queryCount);
	}
	processBatch(limit, offset) {
		const values = this.options.data.slice(offset, offset + limit).map((row) => {
			const key = `${row.business_unit ?? ''}-${row.partner_channel ?? ''}-${row.sales_team ?? ''}-${
				row.brand ?? ''
			}`.toLowerCase();
			const selected = this.options.hash[key];
			const target_period =
				row?.period_type.toLowerCase() == 'quarterly' ? row?.target_period.toUpperCase() : row?.target_period;

			return `('${row.target_type.toLowerCase()}', '${row.period_type.toLowerCase()}', '${CommonHelper.formatPeriod(
				target_period,
				row.period_type.toLowerCase(),
			)}', '${selected?.business_unit}', '${selected?.sales_team?.replace(/'/g, "''") || ''}', '${
				selected?._id_sales_team || ''
			}', '${selected?.brand?.replace(/'/g, "''") || ''}', '${selected?._id_brand || ''}', '${
				selected?.partner_channel?.replace(/'/g, "''") || ''
			}', '${selected?._id_partner_channel || 0}', '${row.target_value_nmv_before_discount || 0}', '${
				row.target_value_nmv_before_discount_internal || 0
			}', '${row.target_value_nmv_before_discount_external || 0}', '${
				row.target_value_nmv_after_discount || 0
			}', '${row.target_value_nmv_after_discount_internal || 0}', '${
				row.target_value_nmv_after_discount_external || 0
			}', '${row.target_value_net_revenue || 0}', '${row.target_value_net_revenue_internal || 0}', '${
				row.target_value_net_revenue_external || 0
			}', '${this?.options?.context?.user?.email}', NOW())`;
		});

		const columns = [
			'target_type',
			'period_type',
			'target_period',
			'business_unit',
			'sales_team',
			'_id_sales_team',
			'brand',
			'_id_brand',
			'partner_channel',
			'_id_partner_channel',
			'target_value_nmv_before_discount',
			'target_value_nmv_before_discount_internal',
			'target_value_nmv_before_discount_external',
			'target_value_nmv_after_discount',
			'target_value_nmv_after_discount_internal',
			'target_value_nmv_after_discount_external',
			'target_value_net_revenue',
			'target_value_net_revenue_internal',
			'target_value_net_revenue_external',
			'uploaded_by',
			'uploaded_at',
		];

		// Generate `SET` values dynamically for `ON CONFLICT`
		const updateColumns = columns
			.filter(
				(col) =>
					![
						'target_type',
						'period_type',
						'target_period',
						'business_unit',
						'sales_team',
						'_id_sales_team',
						'brand',
						'_id_brand',
						'partner_channel',
						'_id_partner_channel',
					].includes(col),
			) // Exclude unique constraint columns
			.map((col) => `${col} = EXCLUDED.${col}`)
			.join(', ');

		const query = `
            INSERT INTO ${TABLE} (${columns.join(', ')})
            VALUES ${values.join(', ')}
            ON CONFLICT ON CONSTRAINT unique_target_sales 
            DO UPDATE SET ${updateColumns};
        `;

		return this.options.client.connectNewDwh.query(query);
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-b2b-upload-target-sales`);
	const filename = document.filename || null;
	const bucket = process.env.S3_UPLOADS_BUCKET;

	const resultS3 = await S3.download({ key: filename, bucket });
	await fs.writeFileSync(filename, resultS3);
	const excel_data = await readXlsxFile(filename);
	const [headers, ...dataRows] = excel_data;
	const data = dataRows.map((row) => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
	const fileStats = fs.statSync(filename);

	const { rows = [] } = await client.connectNewDwh.query(`SELECT * FROM ${document.tmp_table}`);

	const selectedHash = Object.fromEntries(rows.map((row) => [row.channel_key, row]));

	const task = new ImportTargetSales({
		limit: 100,
		offset: 0,
		queryCount: data?.length,
		document,
		hash: selectedHash || {},
		context,
		client,
		clientJarvis,
		stopOnError: true,
		rejectOnError: true,
		data,
	});

	try {
		await task.execute();

		if (context.log_params?.data?.filter) {
			context.log_params.data.filter = JSON.stringify(context.log_params.data.filter);
		}

		await client.connectNewDwh.query(`DROP TABLE ${document.tmp_table}`);
		logger.info(`${document.tmp_table} table deleted, by ${context?.user?.email} to ${criteria.send_to_email}`);
		await clientJarvis
			.db(process.env.JARVIS_MONGODB)
			.collection('user_logs')
			.updateOne(
				{ _id: new ObjectId(context.log_id) },
				{
					$set: {
						...context.log_params,
						filesize: fileStats?.size || 0,
						updated_at: new Date(),
						upload_state: 'success',
					},
				},
			);
		fs.rmSync(filename, { force: true });
	} catch (error) {
		await clientJarvis
			.db(process.env.JARVIS_MONGODB)
			.collection('user_logs')
			.updateOne(
				{ _id: new ObjectId(context.log_id) },
				{
					$set: {
						...context.log_params,
						filesize: fileStats?.size || 0,
						updated_at: new Date(),
						upload_state: 'failed',
					},
				},
			);
		fs.rmSync(filename, { force: true });
		logger.error(error);
		throw error;
	}
};

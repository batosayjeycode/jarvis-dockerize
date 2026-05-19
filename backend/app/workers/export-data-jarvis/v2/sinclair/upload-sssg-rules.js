'use strict';

const fs = require('fs');
const AbstractBatchTask = require('sociolla-core/lib/abstract-batch-task');
const logger = require('sociolla-core/lib/logger').getInstance({ worker: 'export-v2-sincalir-upload-sssg-rules' });
const S3 = require('sociolla-core/lib/aws/s3');
const readXlsxFile = require('read-excel-file/node');
const workerHelpers = require('../../../../helpers/workerHelper');
const TABLE = 'public.config_sssg';
const CommonHelper = require('../../../../helpers/commonHelper');
const ObjectId = require('mongodb').ObjectId;

class ImportSssgRules extends AbstractBatchTask {
	constructor(options) {
		super(options, 'export-v2-sincalir-upload-sssg-rules');
	}
	getTotalCount() {
		logger.info(
			`[${this.options?.context?.user?.name} - ${this.options?.context?.user?.email}] Total count: ${this.options.queryCount}`,
		);
		return Promise.resolve(this.options.queryCount);
	}
	processBatch(limit, offset) {
		const user_email = this?.options?.user_email;
		const user_id = this?.options?.user_id;

		const values = this.options.data.slice(offset, offset + limit).map((row) => {
			return `('${row['Store ID']}', ${row['Year']}, '${CommonHelper.toBoolean(
				row['Comp. Store Status'],
			)}', '${user_id}', '${user_email}', '${user_id}', '${user_email}', NOW(), NOW())`;
		});

		const columns = [
			'store_id',
			'effective_year',
			'is_comp_store',
			'created_by',
			'created_by_email',
			'updated_by',
			'updated_by_email',
			'created_at',
			'updated_at',
		];

		// Generate `SET` values dynamically for `ON CONFLICT`
		const updateColumns = columns
			.filter(
				(col) => !['store_id', 'effective_year', 'created_by', 'created_by_email', 'created_at'].includes(col),
			) // Exclude unique constraint columns
			.map((col) => `${col} = EXCLUDED.${col}`)
			.join(', ');

		const query = `
            INSERT INTO ${TABLE} (${columns.join(', ')})
            VALUES ${values.join(', ')}
            ON CONFLICT ON CONSTRAINT unique_config_sssg 
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
	logger.info(`[${context?.user?.name} - ${context?.user?.email}] Start jarvis v2-sincalir-upload-sssg-rules`);
	const filename = document.filename || null;
	const bucket = process.env.S3_UPLOADS_BUCKET;

	const resultS3 = await S3.download({ key: filename, bucket });
	await fs.writeFileSync(filename, resultS3);
	const excel_data = await readXlsxFile(filename);
	const [headers, ...dataRows] = excel_data;
	const data = dataRows.map((row) => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
	const fileStats = fs.statSync(filename);

	const task = new ImportSssgRules({
		limit: 100,
		offset: 0,
		queryCount: data?.length,
		document,
		user_email: context?.user?.email,
		user_id: context?.user?._id,
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

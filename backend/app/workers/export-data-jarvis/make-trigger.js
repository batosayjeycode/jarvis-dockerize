'use strict';

require('dotenv').config();

const { RabbitMq } = require('sociolla-core/lib/rabbitmq');

RabbitMq.pushToQueue('export-jarvis', {
	criteria: {
		filter: {
			shipped_at: { $gte: 'Fri Jul 03 2020 01:30:00 GMT+0700', $lte: 'Sat Jul 04 2020 01:29:59 GMT+0700' },
		},
	},
	type: 'user-churn-level',
	file_name: 'user-churn-level-part-2.csv',
});

// https://sooc-uat-uploads.s3.amazonaws.com/test-file.csv

setTimeout(() => {
	process.exit(1000);
}, 3000);

import { feature, plan } from 'atmn';

// Features
export const logs = feature({
	id: 'logs',
	name: 'Logs',
	type: 'metered',
	consumable: true,
});

export const metrics = feature({
	id: 'metrics',
	name: 'Metrics',
	type: 'metered',
	consumable: true,
});

export const traces = feature({
	id: 'traces',
	name: 'Traces',
	type: 'metered',
	consumable: true,
});


export const starter = plan({
	id: 'starter',
	name: 'Starter',
	price: {
		amount: 19,
		interval: 'month',
	},
	items: [
		({
			featureId: 'logs',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
		({

			featureId: 'metrics',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
		({
			featureId: 'traces',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
	],
	freeTrial: {
		durationLength: 14,
		durationType: 'day',
		cardRequired: true,
	},
});

export const startup = plan({
	id: 'startup',
	name: 'Startup',
	price: {
		amount: 39,
		interval: 'month',
	},
	items: [
		({
			featureId: 'logs',
			included: 100,
			price: {
				amount: 0.25,
				billingUnits: 1,
				billingMethod: 'usage_based',
				interval: 'month',
			},
		}),
		({
			featureId: 'metrics',
			included: 100,
			price: {
				amount: 0.25,
				billingUnits: 1,
				billingMethod: 'usage_based',
				interval: 'month',
			},
		}),
		({
			featureId: 'traces',
			included: 100,
			price: {
				amount: 0.25,
				billingUnits: 1,
				billingMethod: 'usage_based',
				interval: 'month',
			},
		}),
	],
});



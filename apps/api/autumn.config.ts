import { feature, plan, planFeature } from 'atmn';

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

// Plans
export const free = plan({
	id: 'free',
	name: 'Free',
	auto_enable: true,
	items: [
		planFeature({
			feature_id: 'logs',
			included: 10,
			reset: {
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'metrics',
			included: 10,
			reset: {
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'traces',
			included: 10,
			reset: {
				interval: 'month',
			},
		}),
	],
});

export const starter = plan({
	id: 'starter',
	name: 'Starter',
	price: {
		amount: 19,
		interval: 'month',
	},
	items: [
		planFeature({
			feature_id: 'logs',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'metrics',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'traces',
			included: 50,
			reset: {
				interval: 'month',
			},
		}),
	],
	free_trial: {
		duration_length: 30,
		duration_type: 'day',
		card_required: true,
	},
});

export const startup = plan({
	id: 'startup',
	name: 'Startup',
	price: {
		amount: 29,
		interval: 'month',
	},
	items: [
		planFeature({
			feature_id: 'logs',
			included: 100,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'metrics',
			included: 100,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'traces',
			included: 100,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
	],
});

export const team = plan({
	id: 'team',
	name: 'Team',
	price: {
		amount: 99,
		interval: 'month',
	},
	items: [
		planFeature({
			feature_id: 'logs',
			included: 200,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'metrics',
			included: 200,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
		planFeature({
			feature_id: 'traces',
			included: 200,
			price: {
				amount: 0.25,
				billing_units: 1,
				billing_method: 'usage_based',
				interval: 'month',
			},
		}),
	],
});

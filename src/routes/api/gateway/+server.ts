import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

function typesafeEnvKey() {
	return (
		env.JEV_API_KEY?.trim() ||
		env.TYPESAFE_API_KEY?.trim() ||
		env.TYPESAFE_AI_API_KEY?.trim() ||
		''
	);
}

export const GET: RequestHandler = async () => {
	const gatewayEnv = Boolean(env.AI_GATEWAY_API_KEY?.trim());
	const typesafeEnv = Boolean(typesafeEnvKey());
	return json({
		gatewayEnv,
		typesafeEnv,
		defaultProvider: typesafeEnv ? 'typesafe' : 'gateway',
		serverKey: gatewayEnv || typesafeEnv
	});
};

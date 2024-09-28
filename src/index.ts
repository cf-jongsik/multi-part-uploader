import { Hono, Context } from 'hono';

const app = new Hono<{ Bindings: Env }>();

app.post('/:key', async (c: Context<{ Bindings: Env }>) => {
	const action = c.req.query('action');
	if (!action) {
		return c.text('Missing action query parameter', {
			status: 400,
		});
	}

	switch (action) {
		case 'mpu-create': {
			const multipartUpload = await c.env.r2.createMultipartUpload(c.req.param('key'));
			return c.json({
				key: multipartUpload.key,
				uploadId: multipartUpload.uploadId,
			});
			break;
		}
		case 'mpu-complete': {
			const uploadId = c.req.query('uploadId');
			if (!uploadId) {
				return c.text('Missing uploadId', { status: 400 });
			}

			const multipartUpload = c.env.r2.resumeMultipartUpload(c.req.param('key'), uploadId);
			interface completeBody {
				parts: R2UploadedPart[];
			}
			const completeBody: completeBody = await c.req.json();
			if (!completeBody) {
				return c.text('Missing or incomplete body', {
					status: 400,
				});
			}

			// Error handling in case the multipart upload does not exist anymore
			try {
				const object = await multipartUpload.complete(completeBody.parts);
				return c.json(null, {
					headers: {
						etag: object.httpEtag,
					},
				});
			} catch (error: any) {
				console.log(error);
				return c.json(error, { status: 400 });
			}
			break;
		}
		default:
			return c.text(`Unknown action ${action} for POST`, {
				status: 400,
			});
	}
});

app.get('/:key', async (c: Context<{ Bindings: Env }>) => {
	const action = c.req.query('action');
	if (!action) {
		return c.text('Missing action query parameter', {
			status: 400,
		});
	}
	if (action !== 'get') {
		return c.text(`Unknown action ${action} for GET`, {
			status: 400,
		});
	}
	const object = await c.env.r2.get(c.req.param('key'));
	if (!object) {
		return c.text('Object Not Found', { status: 404 });
	}
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	return c.newResponse(object.body, { headers });
});

app.put('/:key', async (c: Context<{ Bindings: Env }>) => {
	const action = c.req.query('action');
	if (!action) {
		return c.text('Missing action query parameter', {
			status: 400,
		});
	}
	switch (action) {
		case 'mpu-uploadpart': {
			const uploadId = c.req.query('uploadId');
			const partNumberString = c.req.query('partNumber');
			if (!partNumberString || !uploadId) {
				return c.text('Missing partNumber or uploadId', {
					status: 400,
				});
			}
			if (!c.req.raw.body) {
				return c.text('Missing request body', { status: 400 });
			}

			const partNumber = parseInt(partNumberString);
			const multipartUpload = c.env.r2.resumeMultipartUpload(c.req.param('key'), uploadId);
			try {
				const uploadedPart: R2UploadedPart = await multipartUpload.uploadPart(partNumber, c.req.raw.body);
				return c.json(uploadedPart);
			} catch (error: any) {
				return c.text(error.message, { status: 400 });
			}
		}
		default:
			return c.text(`Unknown action ${action} for PUT`, {
				status: 400,
			});
	}
});

app.delete('/:key', async (c: Context<{ Bindings: Env }>) => {
	const action = c.req.query('action');
	if (!action) {
		return c.text('Missing action query parameter', {
			status: 400,
		});
	}
	switch (action) {
		case 'mpu-abort': {
			const uploadId = c.req.query('uploadId');
			if (!uploadId) {
				return c.text('Missing uploadId', { status: 400 });
			}
			const multipartUpload = c.env.r2.resumeMultipartUpload(c.req.param('key'), uploadId);

			try {
				multipartUpload.abort();
			} catch (error: any) {
				return c.text(error.message, { status: 400 });
			}
			return c.text(uploadId, { status: 204 });
		}
		case 'delete': {
			await c.env.r2.delete(c.req.param('key'));
			return c.text(c.req.param('key'), { status: 204 });
		}
		default:
			return c.text(`Unknown action ${action} for DELETE`, {
				status: 400,
			});
	}
});

app.onError((err, c: Context<{ Bindings: Env }>) => {
	return c.text('Method Not Allowed', {
		status: 405,
		headers: { Allow: 'PUT, POST, GET, DELETE' },
	});
});

export default app;

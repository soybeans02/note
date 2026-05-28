// Thin wrapper around @aws-sdk/client-s3 for direct browser → S3 access.
//
// Configuration is via Vite env vars:
//   VITE_AWS_REGION
//   VITE_AWS_BUCKET
//   VITE_AWS_ACCESS_KEY_ID
//   VITE_AWS_SECRET_ACCESS_KEY
//   VITE_AWS_S3_ENDPOINT   (optional — for S3-compatible services)
//   VITE_AWS_S3_PREFIX     (optional — folder inside the bucket)
//
// If any required value is missing, sync is disabled and the rest of the
// app continues to work purely offline.
//
// IMPORTANT: the access key/secret end up in the client bundle. Use an IAM
// user scoped to *only* this single bucket with PutObject / GetObject /
// DeleteObject / ListBucket. Anyone with the deployed URL can read those
// keys via DevTools, so the bucket must not contain anything else sensitive.

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

export interface S3Config {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  prefix: string
}

export function readS3Config(): S3Config | null {
  const region = import.meta.env.VITE_AWS_REGION as string | undefined
  const bucket = import.meta.env.VITE_AWS_BUCKET as string | undefined
  const accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID as string | undefined
  const secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY as
    | string
    | undefined
  if (!region || !bucket || !accessKeyId || !secretAccessKey) return null
  const endpoint = import.meta.env.VITE_AWS_S3_ENDPOINT as string | undefined
  const rawPrefix = (import.meta.env.VITE_AWS_S3_PREFIX as string | undefined) ?? ''
  const prefix = rawPrefix.replace(/^\/+|\/+$/g, '') // trim slashes
  return { region, bucket, accessKeyId, secretAccessKey, endpoint, prefix }
}

export function isS3Configured(): boolean {
  return readS3Config() !== null
}

let _client: S3Client | null = null
let _cfg: S3Config | null = null

function getClient(): { client: S3Client; cfg: S3Config } | null {
  if (_client && _cfg) return { client: _client, cfg: _cfg }
  const cfg = readS3Config()
  if (!cfg) return null
  const init: S3ClientConfig = {
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: !!cfg.endpoint,
  }
  if (cfg.endpoint) init.endpoint = cfg.endpoint
  _client = new S3Client(init)
  _cfg = cfg
  return { client: _client, cfg }
}

function withPrefix(cfg: S3Config, key: string): string {
  return cfg.prefix ? `${cfg.prefix}/${key}` : key
}

export async function s3GetJson<T>(key: string): Promise<T | null> {
  const c = getClient()
  if (!c) return null
  try {
    const out = await c.client.send(
      new GetObjectCommand({ Bucket: c.cfg.bucket, Key: withPrefix(c.cfg, key) }),
    )
    const text = await out.Body!.transformToString()
    return JSON.parse(text) as T
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
      return null
    throw err
  }
}

export async function s3PutJson(key: string, value: unknown): Promise<void> {
  const c = getClient()
  if (!c) throw new Error('S3 not configured')
  const body = JSON.stringify(value)
  await c.client.send(
    new PutObjectCommand({
      Bucket: c.cfg.bucket,
      Key: withPrefix(c.cfg, key),
      Body: body,
      ContentType: 'application/json',
      CacheControl: 'no-cache',
    }),
  )
}

export async function s3GetBlob(key: string): Promise<Blob | null> {
  const c = getClient()
  if (!c) return null
  try {
    const out = await c.client.send(
      new GetObjectCommand({ Bucket: c.cfg.bucket, Key: withPrefix(c.cfg, key) }),
    )
    const ab = await out.Body!.transformToByteArray()
    const type = out.ContentType ?? 'application/octet-stream'
    return new Blob([ab.buffer as ArrayBuffer], { type })
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchKey') return null
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
      return null
    throw err
  }
}

export async function s3PutBlob(key: string, blob: Blob): Promise<void> {
  const c = getClient()
  if (!c) throw new Error('S3 not configured')
  const buf = await blob.arrayBuffer()
  await c.client.send(
    new PutObjectCommand({
      Bucket: c.cfg.bucket,
      Key: withPrefix(c.cfg, key),
      Body: new Uint8Array(buf),
      ContentType: blob.type || 'application/octet-stream',
    }),
  )
}

export async function s3Delete(key: string): Promise<void> {
  const c = getClient()
  if (!c) return
  try {
    await c.client.send(
      new DeleteObjectCommand({ Bucket: c.cfg.bucket, Key: withPrefix(c.cfg, key) }),
    )
  } catch {
    /* ignore — deletes are best-effort */
  }
}

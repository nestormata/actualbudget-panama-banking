import * as fs from 'node:fs';

const HEALTH_FILE = process.env['HEALTH_FILE'] ?? '/tmp/sync-status.json';

export interface HealthStatus {
  lastRunAt: string;
  success: boolean;
  bankResults: Array<{
    bankId: string;
    accountsProcessed: number;
    transactionsAdded: number;
    errors: string[];
  }>;
}

/**
 * Write the sync health status to disk.
 * Used by the Docker HEALTHCHECK to verify the service is running.
 */
export async function writeHealthStatus(status: HealthStatus): Promise<void> {
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(status, null, 2), 'utf-8');
}

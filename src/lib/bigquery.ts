
'use server';

import { BigQuery } from '@google-cloud/bigquery';
import { z } from 'zod';

// Note: Authentication is handled automatically by the environment
// when deployed to Firebase App Hosting or other Google Cloud environments.
// For local development, you'll need to be authenticated via the gcloud CLI.
const bigquery = new BigQuery();

export const SerialInfoSchema = z.object({
  customerName: z.string().optional(),
  orderNumber: z.string().optional(),
  axis1Serial: z.string().optional(),
  axis2Serial: z.string().optional(),
  alignmentPartNumber: z.string().optional(),
});

export type SerialInfo = z.infer<typeof SerialInfoSchema>;

/**
 * Fetches information from BigQuery based on a serial number.
 * @param serialNumber The serial number to look up.
 * @returns A promise that resolves to the serial number information, or null if not found.
 */
export async function getInfoForSerialNumber(serialNumber: string): Promise<SerialInfo | null> {
  // IMPORTANT: Replace with your actual project, dataset, and table names.
  const query = `SELECT
      customerName,
      orderNumber,
      axis1Serial,
      axis2Serial,
      alignmentPartNumber
    FROM \`your-gcp-project-id.your_dataset.your_table\`
    WHERE axis1Serial = @serialNumber OR axis2Serial = @serialNumber
    LIMIT 1`;

  const options = {
    query: query,
    params: { serialNumber: serialNumber },
  };

  try {
    const [rows] = await bigquery.query(options);

    if (rows.length > 0) {
      // Validate the row against the Zod schema to ensure type safety
      const validation = SerialInfoSchema.safeParse(rows[0]);
      if (validation.success) {
        return validation.data;
      } else {
        console.error("BigQuery row does not match schema:", validation.error);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error("Error querying BigQuery:", error);
    // In a real app, you might want to handle this more gracefully
    throw new Error("Failed to fetch data from BigQuery.");
  }
}

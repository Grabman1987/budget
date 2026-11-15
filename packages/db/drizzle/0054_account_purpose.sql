ALTER TABLE account ADD COLUMN purpose TEXT CONSTRAINT account_purpose_chk CHECK (purpose IN ('cash', 'salary', 'settlement', 'investment', 'other'));

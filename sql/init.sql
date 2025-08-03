-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    correlation_id UUID NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    processor_type VARCHAR(20) NOT NULL CHECK (processor_type IN ('default', 'fallback')),
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'processed' CHECK (status IN ('processed', 'failed', 'pending')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_payments_correlation_id ON payments(correlation_id);
CREATE INDEX IF NOT EXISTS idx_payments_processor_type ON payments(processor_type);
CREATE INDEX IF NOT EXISTS idx_payments_requested_at ON payments(requested_at);
CREATE INDEX IF NOT EXISTS idx_payments_processed_at ON payments(processed_at);

-- Create summary view for faster aggregations
CREATE OR REPLACE VIEW payment_summary AS
SELECT 
    processor_type,
    COUNT(*) as total_requests,
    SUM(amount) as total_amount,
    MIN(requested_at) as first_payment,
    MAX(requested_at) as last_payment
FROM payments 
WHERE status = 'processed'
GROUP BY processor_type;

-- Create function to get payment summary by date range
CREATE OR REPLACE FUNCTION get_payment_summary(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    processor_type VARCHAR(20),
    total_requests BIGINT,
    total_amount DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.processor_type,
        COUNT(*)::BIGINT as total_requests,
        COALESCE(SUM(p.amount), 0) as total_amount
    FROM payments p
    WHERE p.status = 'processed'
        AND (p_from IS NULL OR p.requested_at >= p_from)
        AND (p_to IS NULL OR p.requested_at <= p_to)
    GROUP BY p.processor_type;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing (optional)
-- INSERT INTO payments (correlation_id, amount, processor_type, requested_at) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 100.00, 'default', NOW()),
-- ('550e8400-e29b-41d4-a716-446655440001', 200.00, 'fallback', NOW()); 
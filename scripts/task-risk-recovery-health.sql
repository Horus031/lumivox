begin read only;
set local statement_timeout = '8s';
select snapshot from task_risk_monitor.health_snapshot;
rollback;

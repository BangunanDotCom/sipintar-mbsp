-- Run as the reviewed staging schema owner with approved dictionary access.
WHENEVER SQLERROR EXIT SQL.SQLCODE
SELECT SYS_CONTEXT('USERENV','CON_NAME') AS pdb_name,
       SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS current_schema
FROM dual;
SELECT banner_full FROM v$version;
SELECT patch_id, action, status, action_time, description
FROM dba_registry_sqlpatch ORDER BY action_time DESC;
SELECT object_type, status, COUNT(*) AS object_count
FROM user_objects WHERE SUBSTR(object_name,1,4)='STL_'
GROUP BY object_type,status ORDER BY object_type,status;
SELECT tablespace_name, segment_type, SUM(bytes) AS bytes
FROM user_segments WHERE SUBSTR(segment_name,1,4)='STL_'
GROUP BY tablespace_name,segment_type ORDER BY tablespace_name,segment_type;
SELECT l.table_name,l.segment_name,l.index_name
FROM user_lobs l JOIN user_indexes i
  ON i.index_name=l.index_name AND i.table_name=l.table_name
WHERE SUBSTR(l.table_name,1,4)='STL_'
  AND SUBSTR(l.segment_name,1,4)='STL_' AND SUBSTR(l.index_name,1,6)='SYS_IL'
ORDER BY l.table_name,l.index_name;
SELECT table_name,grantee,privilege FROM user_tab_privs_made
WHERE SUBSTR(table_name,1,4)='STL_' ORDER BY table_name,grantee,privilege;
SELECT table_name,column_name,grantee,privilege FROM user_col_privs_made
WHERE SUBSTR(table_name,1,4)='STL_' ORDER BY table_name,column_name,grantee,privilege;

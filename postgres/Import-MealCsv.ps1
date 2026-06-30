param(
  [Parameter(Mandatory = $true)]
  [string]$CsvPath,

  [string]$Container = "postgres",
  [string]$Database = "meal_note",
  [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"

function Assert-LastExit {
  param([string]$Message)
  if ($LASTEXITCODE -ne 0) {
    throw $Message
  }
}

$resolvedCsv = (Resolve-Path -LiteralPath $CsvPath).Path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$schemaPath = Join-Path $scriptDir "schema.sql"
$importSqlPath = Join-Path $scriptDir "import_meals_csv.sql"

$dbExists = docker exec $Container psql -U $User -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$Database'"
Assert-LastExit "Failed to inspect PostgreSQL databases."
if ($dbExists.Trim() -ne "1") {
  docker exec $Container createdb -U $User $Database
  Assert-LastExit "Failed to create database '$Database'."
}

docker cp $schemaPath "${Container}:/tmp/meal_note_schema.sql"
Assert-LastExit "Failed to copy schema SQL into the container."
docker cp $importSqlPath "${Container}:/tmp/meal_note_import.sql"
Assert-LastExit "Failed to copy import SQL into the container."
docker cp $resolvedCsv "${Container}:/tmp/meal_note_import.csv"
Assert-LastExit "Failed to copy CSV into the container."

docker exec $Container psql -U $User -d $Database -v ON_ERROR_STOP=1 -f /tmp/meal_note_schema.sql
Assert-LastExit "Failed to apply schema."
docker exec $Container psql -U $User -d $Database -v ON_ERROR_STOP=1 -f /tmp/meal_note_import.sql
Assert-LastExit "Failed to import CSV."
docker exec $Container psql -U $User -d $Database -c "SELECT count(*) AS meal_records FROM meal_records;"
Assert-LastExit "Failed to count imported records."

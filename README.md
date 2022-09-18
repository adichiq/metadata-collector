# Metis Production Metadata Collector
Collects metadata from production databases to enrich Metis insights. Connection credentials to the databases are saved using AWS Secretes Manager.

## Deployment
After getting your Metis API Key, login to AWS console and go to
[here](https://console.aws.amazon.com/cloudformation/home?#/stacks/create/review?templateURL=https://metis-data-market-public.s3.eu-central-1.amazonaws.com/metadata-collector-cloudformation.yaml&stackName=MetisMetadataCollector)
to create the necessary resources in your cloud environment.

### Minimum IAM Permissions
In order to deploy, your AWS account must have these permissions:
* secretsmanager:CreateSecret
* secretsmanager:PutResourcePolicy
* iam:CreateRole
* ecs:CreateCluster
* ecs:CreateTaskSet
* ecs:RegisterTaskDefinition
* events:PutRule
* ec2:DescribeSubnets
* ec2:DescribeSecurityGroups


### Required Parameters
* **ClusterName** - Your choice of the name of the ECS cluster that will be created.
* **ConnectionStrings** - Connection string to your production database (including the username and password). Multiple connection strings can be given, separated by semicolon (`;`). E.g., postgresql://postgres:postgres@1.2.3.4/example_db_name_pg;postgresql://user1234:password1234@www.sitename.com/db_name_1234
* **MetisAPIKey** - Your API key.
* **SecurityGroupId** - Security group(s) allowing incoming traffic from the Internet and outgoing traffic to the database. The various Security ID Groups are presented as a drop-down menu when clicking on the "SecurityGroupId" field.
* **SubnetId** - Subnet(s) with access to the Internet and to the database. The various Subnet IDs are presented as a drop-down menu when clicking on the "SubnetId" field.

### Created Resources
Clicking *Create stack* will create the following resources in your cloud environment:
* An ECS cluster with the name you supplied.
* A task definition for running the metadata collector.
* An *EventBridge* trigger that runs the task every hour.
* Two *IAM roles*.
* A secret in *AWS Secrets Manager*, storing the connection string(s) to the database.

## Sent Data
The collector sends to Metis Data only logs that describes the running of the collection and metadata, such as:
* Number of rows per table.
* Indexes size.
* Index usage per index.
The full list of queries can be seen in the [queries.yaml file](../master/client-agent/src/queries.yaml).

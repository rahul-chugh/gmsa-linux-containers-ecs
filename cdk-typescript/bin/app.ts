#!/usr/bin/env node
import 'source-map-support/register';
import * as config from './config'

import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack as InfrastructureStack } from '../lib/infrastructure-stack';
import { DatabaseStack } from '../lib/database-stack';
import { ApplicationStack } from '../lib/application-stack';
import { BastionHostStack } from '../lib/bastion-stack';

const envConfig = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
}

const app = new cdk.App();

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
// Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))

if (!config.props.EC2_INSTANCE_KEYPAIR_NAME) {
  throw 'An EC2 Key pair for the AD Management instance is required to create the shared infrastructure.'
}

if (!config.props.MY_SG_INGRESS_IP) {
  throw 'The IP to access the AD Management instance is required to create the shared infrastructure.'
}

// Create shared infrastructure
const infraStack = new InfrastructureStack(app, `${config.props.SOLUTION_ID}-infrastructure`, {
  env: envConfig,
  solutionId: config.props.SOLUTION_ID,
  ecsInstanceKeyPairName: config.props.EC2_INSTANCE_KEYPAIR_NAME,
  domainJoinEcsInstances: config.props.DOMAIN_JOIN_ECS === '1'
});

// Create the SQL Server RDS instance 
const dbStack = new DatabaseStack(app, `${config.props.SOLUTION_ID}-database`, {
  env: envConfig,
  solutionId: config.props.SOLUTION_ID,
  vpc: infraStack.vpc,
  activeDirectoryId: infraStack.activeDirectory.attrAlias,
  ecsAsgSecurityGroup: infraStack.ecsAsgSecurityGroup
});

//Create Bastio  Host / AD Admin Instance
const bastionStack = new BastionHostStack(app, `${config.props.SOLUTION_ID}-bastion`, {
  env: envConfig,
  solutionId: config.props.SOLUTION_ID,
  vpc: infraStack.vpc,
  adInfo: infraStack.adInfo,
  adManagementInstanceKeyPairName: config.props.EC2_INSTANCE_KEYPAIR_NAME,
  adManagementInstanceAccessIp: config.props.MY_SG_INGRESS_IP,
  activeDirectory: infraStack.activeDirectory,
  activeDirectoryAdminPasswordSecret: infraStack.activeDirectoryAdminPasswordSecret,
  domiainJoinSsmDocument: infraStack.domiainJoinSsmDocument,
  domainJoinTag: infraStack.adDomainJoinTagKey,
  sqlServerRdsInstance: dbStack.sqlServerInstance,
  credSpecParameter: infraStack.credSpecParameter,
  domainlessIdentitySecret: infraStack.domainlessIdentitySecret
});

if(config.props.DEPLOY_APP === '1'){
  console.warn(`Revision "${config.props.APP_TD_REVISION}" of the Amazon ECS task definition is been used in the Amazon ECS service. If you want a different revision, set the APP_TD_REVISION environment variable to a different value.`)
}

const appStack = new ApplicationStack(app, `${config.props.SOLUTION_ID}-application`, {
  env: envConfig,
  solutionId: config.props.SOLUTION_ID,
  vpc: infraStack.vpc,
  ecsAsgSecurityGroup: infraStack.ecsAsgSecurityGroup,
  areEcsInstancesDomianJoined: config.props.DOMAIN_JOIN_ECS === '1',
  domainName: infraStack.activeDirectory.name,
  dbInstanceName: dbStack.sqlServerInstance.instanceIdentifier,
  credSpecParameter: infraStack.credSpecParameter,
  domainlessIdentitySecret: infraStack.domainlessIdentitySecret,
  taskDefinitionRevision: config.props.APP_TD_REVISION
});
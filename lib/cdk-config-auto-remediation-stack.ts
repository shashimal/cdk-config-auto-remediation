import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {
    CfnRemediationConfiguration,
    ManagedRule,
    ManagedRuleIdentifiers,
    ResourceType,
    RuleScope
} from "aws-cdk-lib/aws-config";
import {Effect, ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";


export class CdkConfigAutoRemediationStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        //Create the config rule
        const configRule = new ManagedRule(this, 'ConfigS3BucketLoggingEnabled', {
            configRuleName: 's3-bucket-logging-enabled',
            identifier: ManagedRuleIdentifiers.S3_BUCKET_LOGGING_ENABLED,
            ruleScope: RuleScope.fromResources([ResourceType.S3_BUCKET]),
        });

        //Create the AutomationAssumeRole
        const automationAssumeRole = new Role(this, 'AutomationAssumeRole', {
            assumedBy: new ServicePrincipal('ssm.amazonaws.com')
        });

        const putBucketLoggingPolicy = new Policy(this, 'PutBucketLoggingPolicy', {
            statements: [
                new PolicyStatement({
                    effect: Effect.ALLOW,
                    actions: ['s3:PutBucketLogging'],
                    resources: ['*']
                })
            ]
        });

        const automationPassRolePolicy = new Policy(this, 'AutomationPassRolePolicy', {
            statements: [
                new PolicyStatement( {
                    effect: Effect.ALLOW,
                    actions: ['iam:PassRole'],
                    resources: [automationAssumeRole.roleArn]
                })
            ]
        });

        automationAssumeRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonSSMAutomationRole'));
        automationAssumeRole.attachInlinePolicy(putBucketLoggingPolicy);
        automationAssumeRole.attachInlinePolicy(automationPassRolePolicy);


        //Add the remediation action
        const remediationConfiguration = new CfnRemediationConfiguration(this, "S3LoggingEnabledRemediationConfiguration", {
            configRuleName: configRule.configRuleName,
            targetId: "AWS-ConfigureS3BucketLogging",
            targetType: "SSM_DOCUMENT",
            automatic: true,
            parameters: {
                "AutomationAssumeRole": {StaticValue: {Values: [automationAssumeRole.roleArn]}},
                "BucketName": {ResourceValue: {Value: 'RESOURCE_ID'}},
                "GrantedPermission": {StaticValue: {Values: ['FULL_CONTROL']}},
                "GranteeType": {StaticValue: {Values: ['Group']}},
                "GranteeUri": {StaticValue: {Values: ['http://acs.amazonaws.com/groups/s3/LogDelivery']}},
                "TargetBucket": {StaticValue: {Values: ['du-access-logs']}},
            },
            maximumAutomaticAttempts: 2,
            retryAttemptSeconds: 60,
        });
    }
}

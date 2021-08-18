import * as cdk from '@aws-cdk/core';

import { Code, Function as LambdaFunction, Runtime } from '@aws-cdk/aws-lambda';

import path = require('path');
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { Rule, RuleTargetInput, Schedule } from '@aws-cdk/aws-events';
import { LambdaFunction as LambdaFunctionEventsTarget } from '@aws-cdk/aws-events-targets';
import { ImageTag } from './lambda/ami-sweeper';

export interface AMISweeperProps {
  lambdaTimeout?: cdk.Duration
  lambdaRetries?: number
  schedule?: Schedule
  imageTags: ImageTag[]
}

export class AMISweeper extends cdk.Construct {

  public readonly lambdaFunction: LambdaFunction
  public readonly scheduledEventRule: Rule

  constructor(scope: cdk.Construct, id: string, props: AMISweeperProps = {
    lambdaTimeout: cdk.Duration.minutes(1),
    lambdaRetries: 2,
    imageTags: [{ name: "ami-sweeper", value: "true" }],
    schedule: Schedule.rate(cdk.Duration.days(7)),
  }) {
    super(scope, id);

    // Define construct contents here
    this.lambdaFunction = new LambdaFunction(this, "SweeperLambda", {
      runtime: Runtime.NODEJS_14_X,
      handler: "index.handler",
      code: Code.fromAsset(path.join(__dirname, 'lambda', 'ami-sweeper')),
      retryAttempts: props.lambdaRetries,
      timeout: props.lambdaTimeout,
      initialPolicy: [
        new PolicyStatement({
          actions: [
            "ec2:DescribeImages",
            "ec2:DeregisterImage",
            "ec2:DeleteSnapshot",
            "autoscaling:DescribeAutoScalingGroups",
            "imagebuilder:ListImages",
            "imagebuilder:GetImage",
          ],
          resources: ["*"],
        })
      ],
    });

    new Rule(this, `SweeperScheduleRule`, {
      // Documentation: https://docs.aws.amazon.com/lambda/latest/dg/services-cloudwatchevents-expressions.html
      schedule: props.schedule,
      targets: [new LambdaFunctionEventsTarget(this.lambdaFunction, {
        event: RuleTargetInput.fromObject({ tags: props.imageTags })
      })]
    });
  }
}

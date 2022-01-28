import { expect as expectCDK, haveResource, not } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import { AMISweeper } from '../lib/index';

/*
 * Example test
 */
test('SNS Topic Created', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack");
  // WHEN
  new AMISweeper(stack, 'MyTestConstruct');
  // THEN
  expectCDK(stack).to(not(haveResource("AWS::SNS::Topic")));
});

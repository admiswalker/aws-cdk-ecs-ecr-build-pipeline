import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { InstanceType, NatInstanceImage, NatProvider } from 'aws-cdk-lib/aws-ec2';
import * as fs from 'fs';

import * as ecr from 'aws-cdk-lib/aws-ecr';

import { aws_codebuild as codebuild, aws_codecommit as codecommit, aws_codepipeline as codepipeline, aws_codepipeline_actions as codepipeline_actions } from 'aws-cdk-lib';



interface InfraStackProps extends StackProps {
  prj_name: string;
}
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // CodeCommit repository
    const git_repo_name: string = 'example_2022_1129'
    const git_repo = codecommit.Repository.fromRepositoryName(this, 'repo', git_repo_name)
    
    // ECR repository
    const ecr_repo_name: string = 'example_2022_1129_repo';
    const ecr_repo = new ecr.Repository(this, 'ecr', {
      repositoryName: ecr_repo_name,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // CodeBuild
    const code_build = new codebuild.Project(this, 'codeBuild', {
      projectName: 'example_2022_1129',
      description: 'test',
      source: codebuild.Source.codeCommit({
        repository: git_repo,
        branchOrRef: 'refs/heads/master'
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_4_0,
        privileged: true,
        environmentVariables: {
            AWS_ACCOUNT_ID: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: this.account,
            },
            AWS_DEFAULT_REGION: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: this.region,
            },
            IMAGE_REPO_NAME1: {
              type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
              value: ecr_repo_name,
            },
          },
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
    });
    // IAM role for CodeBuild execution
    const new_managed_policy_for_codebuild = new iam.ManagedPolicy(this, 'codebuild_policy_example_2022_1129', {
      document: iam.PolicyDocument.fromJson(
        {
          "Version": "2012-10-17",
          "Statement": [
              {
                  "Effect": "Allow",
                  "Action": [
                      "ecr:GetAuthorizationToken",
                      "ecr:BatchCheckLayerAvailability",
                      "ecr:GetDownloadUrlForLayer",
                      "ecr:GetRepositoryPolicy",
                      "ecr:DescribeRepositories",
                      "ecr:ListImages",
                      "ecr:DescribeImages",
                      "ecr:BatchGetImage",
                      "ecr:GetLifecyclePolicy",
                      "ecr:GetLifecyclePolicyPreview",
                      "ecr:ListTagsForResource",
                      "ecr:DescribeImageScanFindings"
                  ],
                  "Resource": "*"
              }
          ]
      })
    });
    code_build.role?.addManagedPolicy(new_managed_policy_for_codebuild)
    
    // add policy to ECR to push docker image from CodeBuild
    ecr_repo.addToResourcePolicy(
      iam.PolicyStatement.fromJson(
        {
          "Sid": "new statement",
          "Effect": "Allow",
          "Principal": {
            "AWS": code_build.role?.roleArn
          },
          "Action": [
            "ecr:BatchCheckLayerAvailability",
            "ecr:CompleteLayerUpload",
            "ecr:GetAuthorizationToken",
            "ecr:InitiateLayerUpload",
            "ecr:PutImage",
            "ecr:UploadLayerPart"
          ]
        }
      )
    )

    // CodePipeline
    const sourceOutput = new codepipeline.Artifact('SourceArtifact')
    const codepipeline_actionRole = new iam.Role(this, 'CodePipelineActionRole_example_2022_1129', {
      assumedBy: new iam.AccountPrincipal(this.account),
      roleName: 'CodePipelineActionRole_example_2022_1129',
    });
    const pipeline = new codepipeline.Pipeline(this, 'CodePipeline', {
      pipelineName: 'example_2022_1129',
      //role: codepipeline_actionRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'CodeCommit',
              repository: git_repo,
              branch: 'master',
              output: sourceOutput,
            })
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CodeBuild',
              project: code_build,
              input: sourceOutput,
              outputs: [new codepipeline.Artifact()],
              role: codepipeline_actionRole,
            })
          ],
        },
      ],
    });

    //---
  }
}

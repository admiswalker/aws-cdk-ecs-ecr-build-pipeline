import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { InstanceType, NatInstanceImage, NatProvider } from 'aws-cdk-lib/aws-ec2';
import * as fs from 'fs';

import * as ecr from 'aws-cdk-lib/aws-ecr';

import { aws_codebuild as codebuild, aws_codecommit as codecommit } from 'aws-cdk-lib';



interface InfraStackProps extends StackProps {
  prj_name: string;
}
export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraStackProps) {
    super(scope, id, props);

    // ECR repository
    const ecr_repo = new ecr.Repository(this, 'ecr', {
      repositoryName: 'example_2022_1129_repo',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    // CodeBuild
    const code_build = new codebuild.Project(this, 'codeBuild', {
      projectName: 'example_2022_1129',
      description: 'test',
      source: codebuild.Source.codeCommit({
        repository: codecommit.Repository.fromRepositoryName(this, 'repo', 'example_2022_1129'),
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
              value: ecr_repo.repositoryName,
            },
          },
        },
        buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
    });




    //---
    /*
    // VPC1
    const vpc1 = new ec2.Vpc(this, 'vpc1', {
      cidr: '10.0.0.0/16', // address range: 10.0.0.0 - 10.0.255.255
      natGateways: 1,
      //natGatewayProvider: ec2.NatProvider.instance({
      //  instanceType: new InstanceType('t3.nano'),
      //  machineImage: new NatInstanceImage(),
      //}),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
      ],
    });

    // VPC2
    const vpc2 = new ec2.Vpc(this, 'vpc2', {
      cidr: '10.1.0.0/16', // address range: 10.1.0.0 - 10.1.255.255
      natGateways: 1,
      //natGatewayProvider: ec2.NatProvider.instance({
      //  instanceType: new InstanceType('t3.nano'),
      //  machineImage: new NatInstanceImage(),
      //}),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
      ],
    });

    // SSM for vpc1
    const iam_role_for_ssm_for_vpc1 = new iam.Role(this, 'iam_role_for_ssm_for_vpc1', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });
    vpc1.addInterfaceEndpoint('InterfaceEndpoint_ssm', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    vpc1.addInterfaceEndpoint('InterfaceEndpoint_ec2_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });
    vpc1.addInterfaceEndpoint('InterfaceEndpoint_ssm_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });

    // SSM for vpc2
    const iam_role_for_ssm_for_vpc2 = new iam.Role(this, 'iam_role_for_ssm_for_vpc2', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });
    vpc2.addInterfaceEndpoint('InterfaceEndpoint_ssm', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });
    vpc2.addInterfaceEndpoint('InterfaceEndpoint_ec2_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES,
    });
    vpc2.addInterfaceEndpoint('InterfaceEndpoint_ssm_messages', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
    });
    
    // EC2 on VPC1
    const cloud_config_for_vpc1 = ec2.UserData.forLinux({shebang: ''})
    const user_data_script_for_vpc1 = fs.readFileSync('./lib/ec2-stack_user-data_for_vpc1.yaml', 'utf8');
    cloud_config_for_vpc1.addCommands(user_data_script_for_vpc1)
    const multipartUserData_for_vpc1 = new ec2.MultipartUserData();
    multipartUserData_for_vpc1.addPart(ec2.MultipartBody.fromUserData(cloud_config_for_vpc1, 'text/cloud-config; charset="utf8"'));
    
    const ec2_instance_on_vpc1 = new ec2.Instance(this, 'general_purpose_ec2_on_vpc1', {
      instanceType: new ec2.InstanceType('t3.nano'), // 1 Core, 1 GB
//    machineImage: ec2.MachineImage.genericLinux({'us-west-2': 'ami-XXXXXXXXXXXXXXXXX'}),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
        virtualization: ec2.AmazonLinuxVirt.HVM,
        storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      }),
      vpc: vpc1,
//    blockDevices: [{
//	    deviceName: '/dev/sda1',
//	    volume: ec2.BlockDeviceVolume.ebs(30),
//    }],
      vpcSubnets: vpc1.selectSubnets({
        subnetGroupName: 'Private',
      }),
      role: iam_role_for_ssm_for_vpc1,
      userData: multipartUserData_for_vpc1,
    });

    // EC2 on VPC2
    const cloud_config_for_vpc2 = ec2.UserData.forLinux({shebang: ''})
    const user_data_script_for_vpc2 = fs.readFileSync('./lib/ec2-stack_user-data_for_vpc2.yaml', 'utf8');
    cloud_config_for_vpc2.addCommands(user_data_script_for_vpc2)
    const multipartUserData_for_vpc2 = new ec2.MultipartUserData();
    multipartUserData_for_vpc2.addPart(ec2.MultipartBody.fromUserData(cloud_config_for_vpc2, 'text/cloud-config; charset="utf8"'));
    
    const ec2_instance_on_vpc2 = new ec2.Instance(this, 'general_purpose_ec2_on_vpc2', {
      instanceType: new ec2.InstanceType('t3.nano'), // 1 Core, 1 GB
//    machineImage: ec2.MachineImage.genericLinux({'us-west-2': 'ami-XXXXXXXXXXXXXXXXX'}),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
        virtualization: ec2.AmazonLinuxVirt.HVM,
        storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      }),
      vpc: vpc2,
//    blockDevices: [{
//	    deviceName: '/dev/sda1',
//	    volume: ec2.BlockDeviceVolume.ebs(30),
//    }],
      vpcSubnets: vpc2.selectSubnets({
        subnetGroupName: 'Private',
      }),
      role: iam_role_for_ssm_for_vpc2,
      userData: multipartUserData_for_vpc2,
    });

    // Transit Gateway
    const cfnTransitGateway = new ec2.CfnTransitGateway(this, 'CfnTransitGateway', {});
    const cfnTransitGatewayRouteTable = new ec2.CfnTransitGatewayRouteTable(this, 'CfnTransitGatewayRouteTable', {
      transitGatewayId: cfnTransitGateway.attrId,
    });
    const cfnTransitGatewayAttachment_for_vpc1 = new ec2.CfnTransitGatewayAttachment(this, 'CfnTransitGatewayAttachment_for_vpc1', {
      transitGatewayId: cfnTransitGateway.attrId,
      vpcId: vpc1.vpcId,
      subnetIds: vpc1.selectSubnets({subnetGroupName: 'Private'}).subnetIds,
    });
    const cfnTransitGatewayAttachment_for_vpc2 = new ec2.CfnTransitGatewayAttachment(this, 'CfnTransitGatewayAttachment_for_vpc2', {
      transitGatewayId: cfnTransitGateway.attrId,
      vpcId: vpc2.vpcId,
      subnetIds: vpc2.selectSubnets({subnetGroupName: 'Private'}).subnetIds,
    });
    
    vpc1.privateSubnets.map((iSubnet: ec2.ISubnet, index: number) => { // allow packet from VPC1 to VPC2
      new ec2.CfnRoute(this, `Vpc1Route${index}`, {
        routeTableId: iSubnet.routeTable.routeTableId,
        destinationCidrBlock: vpc2.vpcCidrBlock,
        transitGatewayId: cfnTransitGateway.attrId,
      });
    });
    vpc2.privateSubnets.map((iSubnet: ec2.ISubnet, index: number) => { // allow packet from VPC2 to VPC1
      new ec2.CfnRoute(this, `Vpc2Route${index}`, {
        routeTableId: iSubnet.routeTable.routeTableId,
        destinationCidrBlock: vpc1.vpcCidrBlock,
        transitGatewayId: cfnTransitGateway.attrId,
      });
    });
    
    const ec2_instance_on_vpc2_sg = new ec2.SecurityGroup(this, 'ec2_instance_on_vpc2_sg', {
      vpc: vpc2,
      allowAllOutbound: true,
    })
    ec2_instance_on_vpc2_sg.connections.allowFrom(ec2.Peer.ipv4(vpc1.vpcCidrBlock.toString()), ec2.Port.tcp(80), 'Allow access from vpc1')
    ec2_instance_on_vpc2.addSecurityGroup(ec2_instance_on_vpc2_sg);
    */
    //---
  }
}
